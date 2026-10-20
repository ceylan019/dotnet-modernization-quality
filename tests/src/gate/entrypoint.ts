import { pathToFileURL } from 'node:url';

// True when the module at `moduleUrl` is the script node was started with.
export function isEntrypoint(argv1: string | undefined, moduleUrl: string): boolean {
  return argv1 !== undefined && argv1 !== '' && moduleUrl === pathToFileURL(argv1).href;
}
