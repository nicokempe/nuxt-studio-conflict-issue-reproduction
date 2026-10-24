import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const packageConfiguration = JSON.parse(await readFile(new URL('../../package.json', import.meta.url), 'utf8')) as {
  patchedDependencies?: Record<string, string>;
};

/** Whether this checkout installs the candidate Studio patch. */
export const expectedFixed: boolean = Object.hasOwn(packageConfiguration.patchedDependencies ?? {}, 'nuxt-studio@1.8.0');

/** Human-readable label used in reproduction output. */
export const modeLabel: string = expectedFixed ? 'candidate fixes' : 'upstream 1.8.0';

if (process.env.REPRO_EXPECT !== undefined) {
  assert.ok(['upstream', 'fixed'].includes(process.env.REPRO_EXPECT), 'REPRO_EXPECT must be upstream or fixed.');
  assert.equal(expectedFixed, process.env.REPRO_EXPECT === 'fixed', 'The requested mode must match package.json.');
}
