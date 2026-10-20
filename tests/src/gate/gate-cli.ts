import { appendFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isEntrypoint } from './entrypoint';
import { DEFAULT_EVIDENCE_DIR, readCheckEvidence } from './evidence';
import { readPlaywrightResults } from './results';
import { loadRisks } from './risks';
import { evaluateGate, renderGateMarkdown, type Stage } from './traceability';

const STAGES: Stage[] = ['qa', 'staging', 'prod'];

interface GateArgs { stage: Stage; playwright: string; evidence: string; risks: string; out: string }

export function parseGateArgs(argv: string[]): GateArgs {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const flag = argv[i]!;
    const value = argv[i + 1];
    if (!['--stage', '--playwright', '--evidence', '--risks', '--out'].includes(flag)) {
      throw new Error(`Unknown argument ${flag}`);
    }
    if (value === undefined) throw new Error(`Missing value for ${flag}`);
    values.set(flag, value);
  }
  const stage = values.get('--stage') as Stage | undefined;
  if (!stage || !STAGES.includes(stage)) throw new Error(`--stage must be one of ${STAGES.join(', ')}`);
  return {
    stage,
    playwright: values.get('--playwright') ?? 'reports/playwright.json',
    evidence: values.get('--evidence') ?? DEFAULT_EVIDENCE_DIR,
    risks: values.get('--risks') ?? '../docs/quality/risks.json',
    out: values.get('--out') ?? 'reports',
  };
}

export function runGateCli(
  argv: string[], env: Record<string, string | undefined>,
): { output: string; exitCode: number } {
  const args = parseGateArgs(argv);
  const gate = evaluateGate(loadRisks(args.risks), readPlaywrightResults(args.playwright), readCheckEvidence(args.evidence), args.stage);
  const output = renderGateMarkdown(args.stage, gate);
  mkdirSync(args.out, { recursive: true });
  writeFileSync(join(args.out, 'traceability.json'), `${JSON.stringify({ stage: args.stage, ...gate }, null, 2)}\n`);
  if (env.GITHUB_STEP_SUMMARY) appendFileSync(env.GITHUB_STEP_SUMMARY, output);
  return { output, exitCode: gate.problems.length > 0 ? 1 : 0 };
}

if (isEntrypoint(process.argv[1], import.meta.url)) {
  const { output, exitCode } = runGateCli(process.argv.slice(2), process.env);
  console.log(output);
  process.exitCode = exitCode;
}
