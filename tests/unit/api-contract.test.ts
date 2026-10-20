import { readFileSync } from 'node:fs';
import {
  BreakingChangeType,
  buildSchema,
  findBreakingChanges,
  introspectionFromSchema,
  parse,
  validate,
  type BreakingChange,
  type IntrospectionQuery,
} from 'graphql';
import { expect, it } from 'vitest';
import * as operations from '../src/api/operations';
import { breakingChangePath, compareSchemas } from '../src/api/schema-contract';
import type { ApprovedDifference } from '../src/parity/approved-differences';

const BASE = `
  type Query {
    feeQuote(permitTypeCode: String!, areaSqM: Decimal!): FeeQuote
    application(referenceNumber: String!): Application
  }
  type Mutation { submitApplication(input: ApplicationInput!): String }
  type FeeQuote { feeAmount: Decimal! totalAmount: Decimal! }
  type Application { referenceNumber: String! status: ApplicationStatus }
  enum ApplicationStatus { SUBMITTED UNDER_REVIEW EXPIRED }
  input ApplicationInput { firstName: String! email: String }
  scalar Decimal
  scalar Seconds
`;

const intro = (sdl: string): IntrospectionQuery => introspectionFromSchema(buildSchema(sdl));
const approval = (path: string, id = 'AD-1'): ApprovedDifference => ({
  id, suite: 'schema', caseId: 'introspection', path, reason: 'accepted', approvedBy: 'owner', approvedOn: '2026-10-20',
});
const compare = (live: string, approved: ApprovedDifference[] = []) =>
  compareSchemas(intro(BASE), intro(live), approved, 'schema', 'introspection');
const paths = (live: string): string[] => compare(live).unapproved.map((u) => u.path);

it('finds nothing when the schema is unchanged, and counts the recorded types', () => {
  const result = compare(BASE);
  expect(result.unapproved).toEqual([]);
  expect(result.applied).toEqual([]);
  // Query, Mutation, FeeQuote, Application, ApplicationStatus, ApplicationInput, Decimal,
  // Seconds, String and Boolean (introspection types left out).
  expect(result.recordedTypes).toBe(10);
});

it('allows additions: a new type, field, optional argument and enum value', () => {
  const live = BASE
    .replace('totalAmount: Decimal!', 'totalAmount: Decimal! hstAmount: Decimal!')
    .replace('areaSqM: Decimal!)', 'areaSqM: Decimal!, currency: String)')
    .replace('EXPIRED }', 'EXPIRED WITHDRAWN }')
    .concat('\n type Extra { a: Int }');
  expect(paths(live)).toEqual([]);
});

it('reports each unapproved change with its description', () => {
  const result = compare(BASE.replace(' totalAmount: Decimal!', ''));
  expect(result.unapproved).toEqual([
    { path: 'schema:FeeQuote.totalAmount', change: { type: BreakingChangeType.FIELD_REMOVED, description: 'FeeQuote.totalAmount was removed.' } },
  ]);
});

it('lets an approval cover exactly its path and reports which approvals applied', () => {
  const live = BASE.replace(' totalAmount: Decimal!', '').replace('scalar Seconds', '');
  const result = compare(live, [approval('schema:Seconds', 'AD-7'), approval('schema:FeeQuote.feeAmount', 'AD-8')]);
  expect(result.unapproved.map((u) => u.path)).toEqual(['schema:FeeQuote.totalAmount']);
  expect(result.applied).toEqual(['AD-7']);
});

it('ignores approvals recorded for another suite or case', () => {
  const live = BASE.replace('scalar Seconds', '');
  expect(compare(live, [{ ...approval('schema:Seconds'), caseId: 'other' }]).unapproved.map((u) => u.path)).toEqual(['schema:Seconds']);
  expect(compare(live, [{ ...approval('schema:Seconds'), suite: 'other' }]).unapproved.map((u) => u.path)).toEqual(['schema:Seconds']);
});

// One schema pair that produces every kind of breaking change graphql-js knows.
const OLD = `
  interface Node { id: ID! }
  type A implements Node { id: ID! }
  type B { id: ID! }
  union U = A | B
  type Kind { a: Int }
  type Query {
    a: A
    u: U
    kind: Kind
    gone: Int
    narrowed: Int
    q(x: Int, y: Int): Int
    f: Float
  }
  enum E { ONE TWO }
  input I { a: Int }
  scalar Gone
  directive @dropped on FIELD_DEFINITION
  directive @audit(level: Int) repeatable on FIELD_DEFINITION | OBJECT
  type Uses { e: E i: Int g: Gone }
  type Mutation { m(i: I): Uses }
`;
const NEW = `
  interface Node { id: ID! }
  type A { id: ID! }
  type B { id: ID! }
  union U = A
  input Kind { a: Int }
  type Query {
    a: A
    u: U
    kind: Int
    narrowed: String
    q(x: String, z: Int!): Int
  }
  enum E { ONE }
  input I { a: Int b: Int! }
  directive @audit(reason: String!) on FIELD_DEFINITION
  type Uses { e: E i: Int }
  type Mutation { m(i: I): Uses }
`;

it('names every kind of breaking change by its schema path', () => {
  const changes = findBreakingChanges(buildSchema(OLD), buildSchema(NEW));
  const byType = new Map<string, string[]>();
  for (const c of changes) byType.set(c.type, [...(byType.get(c.type) ?? []), breakingChangePath(c)].sort());
  expect(Object.fromEntries(byType)).toEqual({
    [BreakingChangeType.TYPE_REMOVED]: ['schema:Float', 'schema:Gone'],
    [BreakingChangeType.TYPE_CHANGED_KIND]: ['schema:Kind'],
    [BreakingChangeType.TYPE_REMOVED_FROM_UNION]: ['schema:U.B'],
    [BreakingChangeType.VALUE_REMOVED_FROM_ENUM]: ['schema:E.TWO'],
    [BreakingChangeType.REQUIRED_INPUT_FIELD_ADDED]: ['schema:I.b'],
    [BreakingChangeType.IMPLEMENTED_INTERFACE_REMOVED]: ['schema:A'],
    [BreakingChangeType.FIELD_REMOVED]: ['schema:Query.f', 'schema:Query.gone', 'schema:Uses.g'],
    [BreakingChangeType.FIELD_CHANGED_KIND]: ['schema:Query.kind', 'schema:Query.narrowed'],
    [BreakingChangeType.REQUIRED_ARG_ADDED]: ['schema:Query.q'],
    [BreakingChangeType.ARG_REMOVED]: ['schema:Query.q'],
    [BreakingChangeType.ARG_CHANGED_KIND]: ['schema:Query.q'],
    [BreakingChangeType.DIRECTIVE_REMOVED]: ['schema:@dropped'],
    [BreakingChangeType.DIRECTIVE_ARG_REMOVED]: ['schema:@audit'],
    [BreakingChangeType.REQUIRED_DIRECTIVE_ARG_ADDED]: ['schema:@audit'],
    [BreakingChangeType.DIRECTIVE_REPEATABLE_REMOVED]: ['schema:@audit'],
    [BreakingChangeType.DIRECTIVE_LOCATION_REMOVED]: ['schema:@audit'],
  });
  expect([...byType.keys()].sort()).toEqual(Object.values(BreakingChangeType).sort());
});

const change = (type: BreakingChangeType, description: string): BreakingChange => ({ type, description });
const T = BreakingChangeType;

// Descriptions graphql-js never writes, one step away from a real one. Each must be refused
// rather than turned into a path an approval could match.
const NEAR_MISSES: [BreakingChangeType, string][] = [
  [T.TYPE_REMOVED, ' Gone was removed.'],
  [T.TYPE_REMOVED, 'Gone was removedly.'],
  [T.TYPE_REMOVED, 'Standard scalar  Float was removed because it is not referenced anymore.'],
  [T.TYPE_CHANGED_KIND, ' Kind changed from an Object type to an Input type.'],
  [T.TYPE_CHANGED_KIND, '-Kind changed from an Object type to an Input type.'],
  [T.TYPE_REMOVED_FROM_UNION, ' B was removed from union type U.'],
  [T.TYPE_REMOVED_FROM_UNION, 'B was removed from union type U.x'],
  [T.TYPE_REMOVED_FROM_UNION, 'B was removed from union type U!'],
  [T.TYPE_REMOVED_FROM_UNION, 'B was removed from object type U.'],
  [T.VALUE_REMOVED_FROM_ENUM, ' TWO was removed from enum type E.'],
  [T.VALUE_REMOVED_FROM_ENUM, 'TWO was removed from enum type E.x'],
  [T.VALUE_REMOVED_FROM_ENUM, 'TWO was removed from enum type E!'],
  [T.REQUIRED_INPUT_FIELD_ADDED, 'xA required field b on input type I was added.'],
  [T.REQUIRED_INPUT_FIELD_ADDED, 'A required field b on input type I was added.x'],
  [T.REQUIRED_INPUT_FIELD_ADDED, 'A required field b on input type I was added!'],
  [T.IMPLEMENTED_INTERFACE_REMOVED, ' A no longer implements interface Node.'],
  [T.IMPLEMENTED_INTERFACE_REMOVED, 'A no longer implements interface Node.x'],
  [T.IMPLEMENTED_INTERFACE_REMOVED, 'A no longer implements interface Node!'],
  [T.IMPLEMENTED_INTERFACE_REMOVED, 'A no longer implements interface .'],
  [T.REQUIRED_ARG_ADDED, 'xA required arg z on Query.q was added.'],
  [T.REQUIRED_ARG_ADDED, 'A required arg z on Query.q was added.x'],
  [T.REQUIRED_ARG_ADDED, 'A required arg z on Query.q was added!'],
  [T.REQUIRED_ARG_ADDED, 'A required arg z on Query-q was added.'],
  [T.REQUIRED_ARG_ADDED, 'A required arg  on Query.q was added.'],
  [T.FIELD_REMOVED, ' Query.gone was removed.'],
  [T.FIELD_REMOVED, 'Query-gone was removed.'],
  [T.FIELD_CHANGED_KIND, 'Query.kind'],
  [T.ARG_REMOVED, '.q arg y was removed.'],
  [T.ARG_CHANGED_KIND, 'Query. arg x has changed type from Int to String.'],
  [T.DIRECTIVE_REMOVED, ' dropped was removed.'],
  [T.DIRECTIVE_REMOVED, 'dropped was removed.x'],
  [T.DIRECTIVE_REMOVED, 'dropped was removed!'],
  [T.REQUIRED_DIRECTIVE_ARG_ADDED, 'xA required arg reason on directive audit was added.'],
  [T.REQUIRED_DIRECTIVE_ARG_ADDED, 'A required arg reason on directive audit was added.x'],
  [T.REQUIRED_DIRECTIVE_ARG_ADDED, 'A required arg reason on directive audit was added!'],
  [T.REQUIRED_DIRECTIVE_ARG_ADDED, 'A required arg  on directive audit was added.'],
  [T.DIRECTIVE_ARG_REMOVED, 'level was removed from audit.x'],
  [T.DIRECTIVE_ARG_REMOVED, 'level was removed from audit!'],
  [T.DIRECTIVE_REPEATABLE_REMOVED, 'Repeatable flag was removed from .'],
  [T.DIRECTIVE_LOCATION_REMOVED, 'OBJECT was removed fromaudit.'],
];

it('refuses a description it does not recognize instead of guessing a path', () => {
  for (const [type, description] of NEAR_MISSES) {
    expect(() => breakingChangePath(change(type, description)), `${type}: ${description}`)
      .toThrow(`Unrecognized breaking change ${type}: ${description}`);
  }
  expect(() => breakingChangePath(change('SOMETHING_NEW' as BreakingChangeType, 'X.y was removed.')))
    .toThrow('Unrecognized breaking change SOMETHING_NEW: X.y was removed.');
});

it('keeps multi-letter names whole', () => {
  expect(breakingChangePath(change(T.FIELD_REMOVED, 'FeeQuote.totalAmount was removed.'))).toBe('schema:FeeQuote.totalAmount');
  expect(breakingChangePath(change(T.VALUE_REMOVED_FROM_ENUM, 'UNDER_REVIEW was removed from enum type ApplicationStatus.'))).toBe('schema:ApplicationStatus.UNDER_REVIEW');
  expect(breakingChangePath(change(T.TYPE_REMOVED, 'Standard scalar Float was removed because it is not referenced anymore.'))).toBe('schema:Float');
  expect(breakingChangePath(change(T.DIRECTIVE_LOCATION_REMOVED, 'FIELD_DEFINITION was removed from audit.'))).toBe('schema:@audit');
  expect(breakingChangePath(change(T.REQUIRED_INPUT_FIELD_ADDED, 'A required field phone on input type ApplicationInput was added.'))).toBe('schema:ApplicationInput.phone');
  expect(breakingChangePath(change(T.IMPLEMENTED_INTERFACE_REMOVED, 'Application no longer implements interface Node.'))).toBe('schema:Application');
  expect(breakingChangePath(change(T.REQUIRED_ARG_ADDED, 'A required arg year on Query.application was added.'))).toBe('schema:Query.application');
  expect(breakingChangePath(change(T.REQUIRED_DIRECTIVE_ARG_ADDED, 'A required arg reason on directive audit was added.'))).toBe('schema:@audit');
});

const LEGACY_SDL = readFileSync(new URL('./fixtures/legacy-schema.graphql', import.meta.url), 'utf8');

it('every document in operations.ts is valid against the legacy schema', () => {
  const schema = buildSchema(LEGACY_SDL);
  const documents = Object.entries(operations);
  expect(documents.map(([name]) => name).sort()).toEqual(
    ['APPLICATION', 'CHANGE_STATUS', 'DUE_DATE', 'FEE_QUOTE', 'INTROSPECTION', 'PERMIT_TYPES', 'SEARCH', 'SUBMIT'],
  );
  for (const [name, doc] of documents) {
    expect(validate(schema, parse(doc)).map((e) => e.message), name).toEqual([]);
  }
});

it('each operation document names the operation it runs', () => {
  const names = Object.fromEntries(Object.entries(operations).map(([key, doc]) => {
    const op = parse(doc).definitions.find((d) => d.kind === 'OperationDefinition');
    return [key, op && 'name' in op ? `${op.operation} ${op.name?.value}` : undefined];
  }));
  expect(names).toEqual({
    APPLICATION: 'query Application',
    CHANGE_STATUS: 'mutation ChangeStatus',
    DUE_DATE: 'query DueDate',
    FEE_QUOTE: 'query FeeQuote',
    INTROSPECTION: 'query Introspection',
    PERMIT_TYPES: 'query PermitTypes',
    SEARCH: 'query Search',
    SUBMIT: 'mutation Submit',
  });
});
