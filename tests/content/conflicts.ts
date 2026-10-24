import assert from 'node:assert/strict';
import { isDocumentMatchingContent } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/compare.js';
import { contentFromDocument } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/generate.js';
import { expectedFixed, modeLabel } from '../support/mode';
import { markdownSource, readFixture, storedDocument } from '../support/content';

const source = await readFixture('components.md');
const stored = await storedDocument(source);
const unchangedMatches = await isDocumentMatchingContent(source, stored);
assert.equal(unchangedMatches, expectedFixed,
  'Identical source should match its Content 3 database document. Upstream reproduces a false conflict.');

// Genuine text, type, slot and relationship changes must still be conflicts.
for (const changed of [
  source.replace('Primary action', 'Changed action'),
  source.replace('title: Example page', 'title: Changed title'),
  source.replace('enabled: true', 'enabled: false'),
  source.replace('count: 3', 'count: 4'),
  source.replace('count: 3', "count: '3'"),
  source.replace('#primaryLabel', '#primary-label'),
  source.replace('mailto:editor@example.test', 'mailto:other@example.test'),
]) {
  assert.equal(await isDocumentMatchingContent(changed, stored), false,
    'The repair must preserve real conflict detection.');
}

// Canonical formatting is a separate raw-source question, not a Git conflict.
const formatted = markdownSource(await contentFromDocument(stored));
assert.notEqual(formatted, source, 'This intentionally noncanonical fixture requires a formatting pass.');
if (expectedFixed) {
  assert.equal(await isDocumentMatchingContent(formatted, stored), true,
    'Canonical formatting must preserve the original document meaning.');
  const secondPass = markdownSource(await contentFromDocument(await storedDocument(formatted)));
  assert.equal(secondPass, formatted, 'A second native formatting pass must be stable.');
}

const literalCases = [
  ['```python\nif ready:\n    run()\n```', '```python\nif ready:\nrun()\n```', false],
  ['```text\nfirst\nsecond\n```', '```text\nfirstsecond\n```', true],
  ['[Guide](https://example.test/a)', '[Guide](https://example.test/b)', false],
] as const;
for (const [original, changed, upstreamMatches] of literalCases) {
  assert.equal(await isDocumentMatchingContent(changed, await storedDocument(original)), expectedFixed ? false : upstreamMatches,
    'A comparison must not erase meaningful code whitespace or link changes. Upstream erases literal newlines.');
}

console.log(`[${modeLabel}] Conflict comparison: unchanged match=${unchangedMatches}; real edits remain conflicts; canonical formatting checked separately.`);
