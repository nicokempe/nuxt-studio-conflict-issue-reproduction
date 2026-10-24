import assert from 'node:assert/strict';
import { parseMarkdown as parseComark, parseFrontmatter } from 'comark';
import { renderMarkdown } from 'comark/render';
import type { CollectionInfo } from '@nuxt/content';
import { contentFromDocument, documentFromContent } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/generate.js';
import { expectedFixed, modeLabel } from '../support/mode';
import { fixtureCollection, markdownSource, readFixture, storedDocument } from '../support/content';

// Isolate Comark's case normalization without any Nuxt or editor UI boundary.
const slotSource = '::sample-card\n#primaryLabel\nAction\n::\n';
const slotDocument = await documentFromContent('fixture/slots.md', slotSource);
assert.ok(slotDocument);
const slots = markdownSource(await contentFromDocument(slotDocument));
assert.equal(slots.includes('#primaryLabel'), expectedFixed,
  'Vue named-slot spelling is case-sensitive; component normalization must not rename slots.');

// Force YAML attributes to isolate a distinct bug: strings that look like booleans.
const typedTree = await parseComark('::sample-card\n---\ntextTrue: \'true\'\ntextFalse: \'false\'\ntextNumber: \'3\'\n---\nText\n::\n');
const typedSource = await renderMarkdown(typedTree, { blockAttributesStyle: 'frontmatter', maxInlineAttributes: 0 });
const typedRoundtrip = await parseComark(typedSource);
const card = typedRoundtrip.nodes.find(node => Array.isArray(node) && node[0] === 'sample-card');
assert.ok(Array.isArray(card));
assert.deepEqual(card[1], expectedFixed
  ? { textTrue: 'true', textFalse: 'false', textNumber: '3' }
  : { ':textTrue': 'true', ':textFalse': 'false', textNumber: '3' },
  'Upstream turns literal boolean-like strings into bound boolean properties.');

// A period in an arbitrary CSS class is data, not a class-shorthand separator.
const classTree = await parseComark('An :badge[Status]{class="tracking-[0.06em]"} stays inline.\n');
const classRoundtrip = await parseComark(await renderMarkdown(classTree));
const paragraph = classRoundtrip.nodes[0];
assert.ok(Array.isArray(paragraph));
const badge = paragraph.slice(2).find(node => Array.isArray(node) && node[0] === 'badge');
assert.ok(Array.isArray(badge));
assert.equal(badge[1].class, expectedFixed ? 'tracking-[0.06em]' : 'tracking-[0 06em]',
  'Inline serialization must not split a literal class at its decimal point.');

// MDC stores table alignment as an attribute; the original writer ignored it.
const tableSource = await readFixture('code-and-table.md');
const tablePublished = markdownSource(await contentFromDocument(await storedDocument(tableSource)));
assert.equal(/\|\s*-+:\s*\|/u.test(tablePublished), expectedFixed,
  'An unchanged right-aligned column must retain its Markdown alignment marker.');
assert.ok(tablePublished.includes('if ready:\n    run()'), 'Code indentation must survive publication.');
assert.ok(tablePublished.includes('first\nsecond'), 'Literal code newlines must survive publication.');

// Hidden fields belong to the published source even when absent from the form model.
const hiddenCollection: CollectionInfo = {
  ...fixtureCollection,
  schema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $ref: '#/definitions/fixture',
    definitions: {
      fixture: {
        type: 'object',
        required: [],
        additionalProperties: false,
        properties: {
          slug: { type: 'string', $content: { editor: { hidden: true } } },
          navigation: { type: 'boolean', $content: { editor: { hidden: true } } },
        },
      },
    },
  },
};
const metadata = await storedDocument(await readFixture('metadata.md'), 'metadata.md', hiddenCollection);
assert.equal(Object.hasOwn(metadata, 'slug'), false, 'The field stays hidden from the form.');
const published = parseFrontmatter(markdownSource(await contentFromDocument(metadata))).data;
assert.equal(published.slug, expectedFixed ? 'example-route' : undefined,
  'Hiding an authored field must not delete it from the published file.');
assert.equal(published.navigation, expectedFixed ? false : undefined);
assert.deepEqual(published.seo, { title: 'A distinct search title' }, 'Distinct authored SEO remains present.');

console.log(`[${modeLabel}] Serialization: slot case, string types, arbitrary classes, table alignment and hidden metadata checked against installed packages.`);
