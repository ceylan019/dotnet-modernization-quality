import {
  BreakingChangeType,
  buildClientSchema,
  findBreakingChanges,
  isIntrospectionType,
  type BreakingChange,
  type IntrospectionQuery,
} from 'graphql';
import { filterApproved, type ApprovedDifference } from '../parity/approved-differences';
import type { Difference } from '../parity/diff';

function match(description: string, pattern: RegExp, path: (m: RegExpExecArray) => string): string | undefined {
  const m = pattern.exec(description);
  return m ? path(m) : undefined;
}

// Where a breaking change lives, as `schema:<type>.<field>` (`schema:<type>` for whole types,
// `schema:@<directive>` for directives). Approved differences name this path. An unrecognized
// description throws, so a new kind of change can never slip through as approved.
export function breakingChangePath(change: BreakingChange): string {
  const d = change.description;
  let path: string | undefined;
  switch (change.type) {
    case BreakingChangeType.TYPE_REMOVED:
      path = match(d, /^(?:Standard scalar )?(\w+) was removed\b/, (m) => m[1]!);
      break;
    case BreakingChangeType.TYPE_CHANGED_KIND:
      path = match(d, /^(\w+) changed from /, (m) => m[1]!);
      break;
    case BreakingChangeType.TYPE_REMOVED_FROM_UNION:
    case BreakingChangeType.VALUE_REMOVED_FROM_ENUM:
      path = match(d, /^(\w+) was removed from (?:union|enum) type (\w+)\.$/, (m) => `${m[2]}.${m[1]}`);
      break;
    case BreakingChangeType.REQUIRED_INPUT_FIELD_ADDED:
      path = match(d, /^A required field (\w+) on input type (\w+) was added\.$/, (m) => `${m[2]}.${m[1]}`);
      break;
    case BreakingChangeType.IMPLEMENTED_INTERFACE_REMOVED:
      path = match(d, /^(\w+) no longer implements interface \w+\.$/, (m) => m[1]!);
      break;
    case BreakingChangeType.REQUIRED_ARG_ADDED:
      path = match(d, /^A required arg \w+ on (\w+)\.(\w+) was added\.$/, (m) => `${m[1]}.${m[2]}`);
      break;
    case BreakingChangeType.FIELD_REMOVED:
    case BreakingChangeType.FIELD_CHANGED_KIND:
    case BreakingChangeType.ARG_REMOVED:
    case BreakingChangeType.ARG_CHANGED_KIND:
      path = match(d, /^(\w+)\.(\w+) /, (m) => `${m[1]}.${m[2]}`);
      break;
    case BreakingChangeType.DIRECTIVE_REMOVED:
      path = match(d, /^(\w+) was removed\.$/, (m) => `@${m[1]}`);
      break;
    case BreakingChangeType.REQUIRED_DIRECTIVE_ARG_ADDED:
      path = match(d, /^A required arg \w+ on directive (\w+) was added\.$/, (m) => `@${m[1]}`);
      break;
    case BreakingChangeType.DIRECTIVE_ARG_REMOVED:
    case BreakingChangeType.DIRECTIVE_REPEATABLE_REMOVED:
    case BreakingChangeType.DIRECTIVE_LOCATION_REMOVED:
      path = match(d, / from (\w+)\.$/, (m) => `@${m[1]}`);
      break;
  }
  if (path === undefined) throw new Error(`Unrecognized breaking change ${change.type}: ${d}`);
  return `schema:${path}`;
}

export interface ContractResult {
  // Named types of the recorded schema, introspection types left out.
  recordedTypes: number;
  unapproved: { path: string; change: BreakingChange }[];
  applied: string[];
}

// Breaking changes from the recorded schema to the live one that no approved difference covers.
// Additions are never breaking, so the modern API may grow.
export function compareSchemas(
  recorded: IntrospectionQuery,
  live: IntrospectionQuery,
  approved: ApprovedDifference[],
  suite: string,
  caseId: string,
): ContractResult {
  const before = buildClientSchema(recorded);
  const after = buildClientSchema(live);
  const changes = new Map<Difference, BreakingChange>();
  for (const change of findBreakingChanges(before, after)) {
    changes.set({ path: breakingChangePath(change), kind: 'changed', actual: change.description }, change);
  }
  const { remaining, applied } = filterApproved([...changes.keys()], suite, caseId, approved);
  return {
    recordedTypes: Object.values(before.getTypeMap()).filter((t) => !isIntrospectionType(t)).length,
    unapproved: remaining.map((d) => ({ path: d.path, change: changes.get(d)! })),
    applied,
  };
}
