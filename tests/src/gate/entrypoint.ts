import { pathToFileURL } from 'node:url';

export interface CliRun { output: string; exitCode: number }

// Prints a finished CLI run and sets the process exit code.
export function exitWith(run: CliRun): void {
  console.log(run.output);
  process.exitCode = run.exitCode;
}

// True when the module at `moduleUrl` is the script node was started with.
export function isEntrypoint(argv1: string | undefined, moduleUrl: string): boolean {
  return argv1 !== undefined && argv1 !== '' && moduleUrl === pathToFileURL(argv1).href;
}
