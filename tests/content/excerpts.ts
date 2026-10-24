import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { compressTree } from '@nuxt/content/runtime';
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { expectedFixed, modeLabel } from '../support/mode';

/** Private Content transformer surface evaluated from the installed package. */
interface MarkdownTransformer {
  parse: (file: { id: string, body: string }, options: { compress: boolean }) => Promise<Record<string, unknown>>
}

/** Reject unrelated plugins; parsing and tree compression use the real packages. */
async function emptyPlugins(plugins?: Record<string, unknown>): Promise<Record<string, unknown>> {
  assert.equal(Object.keys(plugins ?? {}).length, 0);
  return plugins ?? {};
}

/** Execute Content's complete installed definition without starting a Nuxt server. */
async function transformer(distribution: 'mjs' | 'cjs'): Promise<MarkdownTransformer> {
  const source = await readFile(new URL(`../../node_modules/@nuxt/content/dist/module.${distribution}`, import.meta.url), 'utf8');
  const start = source.indexOf('const markdown = defineTransformer({');
  const end = source.indexOf('\nasync function importPlugins(', start);
  assert.ok(start >= 0 && end > start, 'Pinned transformer boundaries must exist.');
  const evaluate = new Function('defineTransformer', 'parseMarkdown', 'fromHast', 'runtime', 'hast', 'importPlugins', 'link',
    `"use strict";\n${source.slice(start, end)}\nreturn markdown;`) as (...dependencies: unknown[]) => MarkdownTransformer;
  return evaluate(
    (definition: unknown): unknown => definition,
    parseMarkdown,
    compressTree,
    { parseMarkdown },
    { fromHast: compressTree },
    emptyPlugins,
    () => { throw new Error('This fixture must not exercise custom link handlers.'); },
  );
}

const opening = 'A generated opening paragraph.';
const body = `${opening}\n\n<!--more-->\n\nRemaining article.\n`;
const parsed = await parseMarkdown(body, { highlight: false });
assert.ok(parsed.excerpt);

for (const distribution of ['mjs', 'cjs'] as const) {
  const native = await transformer(distribution);
  for (const compress of [false, true]) {
    const generated: unknown = compress ? compressTree(structuredClone(parsed.excerpt)) : parsed.excerpt;
    const authored = await native.parse({ id: 'fixture/excerpt.md', body: `---\nexcerpt: Authored listing summary\n---\n\n${body}` }, { compress });
    assert.deepEqual(authored.excerpt, expectedFixed ? 'Authored listing summary' : generated,
      'An authored string should take precedence over the generated excerpt.');
    const fallback = await native.parse({ id: 'fixture/excerpt.md', body }, { compress });
    assert.deepEqual(fallback.excerpt, generated, 'Documents without an authored summary keep the normal generated excerpt.');
  }
}

console.log(`[${modeLabel}] Content excerpts: authored summary and generated fallback checked in ESM/CJS, compressed/uncompressed.`);
