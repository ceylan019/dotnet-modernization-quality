import { readFileSync } from 'node:fs';
import { z } from 'zod';

export const COLUMN_KINDS = ['text', 'varchar', 'money', 'decimal', 'int', 'bool', 'date', 'datetime'] as const;

// Names go into SQL text, so only plain identifiers (optionally schema qualified) are accepted.
const identifier = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*(\.[A-Za-z_][A-Za-z0-9_]*)*$/);
const column = z.string().regex(/^[A-Za-z_][A-Za-z0-9_]*$/);

const ColumnMapSchema = z.strictObject({
  source: column,
  target: column,
  kind: z.enum(COLUMN_KINDS),
});

const TableMapSchema = z
  .strictObject({
    source: identifier,
    target: identifier,
    key: z.array(column).min(1),
    columns: z.array(ColumnMapSchema).min(1),
  })
  .superRefine((t, ctx) => {
    const names = new Set(t.columns.map((c) => c.source));
    for (const k of t.key) {
      if (!names.has(k)) ctx.addIssue({ code: 'custom', message: `key column ${k} is not in columns of ${t.source}` });
    }
  });

const ForeignKeySchema = z.strictObject({
  table: identifier,
  columns: z.array(column).min(1),
  refTable: identifier,
  refColumns: z.array(column).min(1),
});

// A mapping file is either a plain array of tables or { tables, foreignKeys } (target names).
const MappingFileSchema = z.union([
  z.array(TableMapSchema),
  z.strictObject({ tables: z.array(TableMapSchema), foreignKeys: z.array(ForeignKeySchema).default([]) }),
]);

export type ColumnMap = z.infer<typeof ColumnMapSchema>;
export type TableMap = z.infer<typeof TableMapSchema>;
export type ForeignKey = z.infer<typeof ForeignKeySchema>;

function parseFile(file: string) {
  const parsed = MappingFileSchema.safeParse(JSON.parse(readFileSync(file, 'utf8')));
  if (!parsed.success) {
    throw new Error(`Invalid mapping ${file}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`);
  }
  return Array.isArray(parsed.data) ? { tables: parsed.data, foreignKeys: [] as ForeignKey[] } : parsed.data;
}

export function loadMapping(file: string): TableMap[] {
  return parseFile(file).tables;
}

export function loadForeignKeys(file: string): ForeignKey[] {
  return parseFile(file).foreignKeys;
}
