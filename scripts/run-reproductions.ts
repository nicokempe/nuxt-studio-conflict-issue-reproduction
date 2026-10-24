import { readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

/** Run each isolated package reproduction in a fresh process. */
async function runReproductions(): Promise<void> {
  const paths = (await readdir(new URL('../tests/', import.meta.url), { recursive: true }))
    .filter(path => path.endsWith('.ts') && !path.startsWith('support/'))
    .sort();
  if (paths.length === 0) throw new Error('No reproduction scripts were found.');
  for (const path of paths) {
    const subprocess = spawnSync(process.execPath, [join('tests', path)], {
      cwd: new URL('../', import.meta.url),
      stdio: 'inherit',
      env: process.env,
    });
    if (subprocess.error) throw subprocess.error;
    if (subprocess.status !== 0) process.exit(1);
  }
  process.stdout.write(`Verified ${paths.length} reproduction scripts.\n`);
}

await runReproductions();
