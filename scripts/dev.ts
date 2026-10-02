import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

const LOCAL_DATABASE_URL = 'postgres://joby:joby@localhost:5433/joby';
const scoopPdftotext = process.platform === 'win32' && process.env.USERPROFILE
  ? join(process.env.USERPROFILE, 'scoop', 'apps', 'poppler', 'current', 'bin', 'pdftotext.exe')
  : undefined;
const env = {
  ...process.env,
  DATABASE_URL: process.env.DATABASE_URL ?? LOCAL_DATABASE_URL,
  ...(process.env.PDFTOTEXT_PATH || !scoopPdftotext || !existsSync(scoopPdftotext)
    ? {}
    : { PDFTOTEXT_PATH: scoopPdftotext }),
};
const pnpm = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm';

function run(command: string, args: readonly string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    // Windows runs pnpm through a .cmd shim, which Node can only launch through its shell.
    const child = spawn(command, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
    child.once('error', (error) => reject(error));
    child.once('exit', (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(' ')} exited with code ${String(code)}.`));
    });
  });
}

function start(name: string, args: readonly string[]): ChildProcess {
  const child = spawn(pnpm, args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  child.once('error', (error) => {
    console.error(`Could not start ${name}:`, error.message);
    void stop(1);
  });
  child.once('exit', (code) => {
    if (!stopping) {
      console.error(`${name} stopped unexpectedly (exit code ${String(code)}).`);
      void stop(code ?? 1);
    }
  });
  return child;
}

let stopping = false;
let children: readonly ChildProcess[] = [];

async function stop(exitCode = 0): Promise<void> {
  if (stopping) return;
  stopping = true;
  for (const child of children) child.kill('SIGTERM');
  process.exit(exitCode);
}

async function main(): Promise<void> {
  console.log('Starting Joby local development…');
  try {
    await run('docker', ['compose', 'up', '--detach', '--wait']);
  } catch (error) {
    console.error('\nJoby could not start its database. Open Docker Desktop, wait for it to be running, then run `pnpm dev` again.');
    throw error;
  }
  await run(pnpm, ['db:migrate']);
  children = [start('API', ['api']), start('worker', ['worker'])];
  console.log('\nJoby is running: http://localhost:3001/identity/import');
  console.log('Press Ctrl+C to stop the API and worker. The database remains available for your next run.');
}

process.on('SIGINT', () => void stop());
process.on('SIGTERM', () => void stop());
void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
