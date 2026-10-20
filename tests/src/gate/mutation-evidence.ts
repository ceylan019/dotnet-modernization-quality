import { readFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { DEFAULT_EVIDENCE_DIR, writeCheckEvidence, type CheckEvidence } from './evidence';
import { isEntrypoint } from './entrypoint';

export const MUTATION_EVIDENCE_NAME = 'mutation-score';
export const MUTATION_THRESHOLD = 85;

interface MutationReport {
  files?: Record<string, { mutants?: { status?: string }[] } | undefined>;
}

// Evidence for RISK-TEST-01, from the Stryker JSON report. Ignored and compile-error mutants are
// not counted (same as Stryker's own score). A report with no scored mutants is refused.
export function mutationEvidence(report: MutationReport): CheckEvidence {
  const files = report.files;
  if (!files || typeof files !== 'object') throw new Error('Not a Stryker mutation report: no "files" object');
  const counts = { Killed: 0, Survived: 0, Timeout: 0, NoCoverage: 0 };
  for (const file of Object.values(files)) {
    for (const mutant of file?.mutants ?? []) {
      if (mutant.status !== undefined && mutant.status in counts) counts[mutant.status as keyof typeof counts] += 1;
    }
  }
  const examined = counts.Killed + counts.Survived + counts.Timeout + counts.NoCoverage;
  if (examined === 0) throw new Error('The mutation report contains no scored mutants');
  const score = ((counts.Killed + counts.Timeout) / examined) * 100;
  const passed = score >= MUTATION_THRESHOLD && counts.Killed > 0;
  return {
    name: MUTATION_EVIDENCE_NAME,
    risks: ['RISK-TEST-01'],
    passed,
    examined,
    detail: `mutation score ${score.toFixed(2)}% (threshold ${MUTATION_THRESHOLD}): killed ${counts.Killed}, timeout ${counts.Timeout}, survived ${counts.Survived}, no coverage ${counts.NoCoverage}`,
  };
}

const USAGE = 'Usage: tsx src/gate/mutation-evidence.ts <mutation.json> [--out <evidence dir>]';

function main(): void {
  const { positionals, values } = parseArgs({ allowPositionals: true, options: { out: { type: 'string', default: DEFAULT_EVIDENCE_DIR } } });
  const [input] = positionals;
  if (!input) throw new Error(USAGE);
  const evidence = mutationEvidence(JSON.parse(readFileSync(input, 'utf8')) as MutationReport);
  writeCheckEvidence(evidence, values.out);
  console.log(JSON.stringify(evidence, null, 2));
  process.exitCode = evidence.passed ? 0 : 1;
}

if (isEntrypoint(process.argv[1], import.meta.url)) main();
