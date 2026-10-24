import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { compressTree } from '@nuxt/content/runtime';
import type { CollectionInfo } from '@nuxt/content';
import type { DatabaseItem } from 'nuxt-studio/app';
import { ensureComarkBody } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/legacy.js';
import { sanitizeDocumentTree } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/tree.js';
import { contentFromDocument } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/generate.js';
import { isDocumentMatchingContent } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/compare.js';

/** Read a synthetic fixture relative to this repository, without external data. */
export async function readFixture(filename: string): Promise<string> {
  return readFile(new URL(`../../fixtures/${filename}`, import.meta.url), 'utf8');
}

/** The smallest collection contract needed by Studio's database ingress. */
export const fixtureCollection: CollectionInfo = {
  name: 'fixture',
  pascalName: 'Fixture',
  tableName: '_content_fixture',
  source: [],
  type: 'page',
  schema: {
    $schema: 'http://json-schema.org/draft-07/schema#',
    $ref: '#/definitions/fixture',
    definitions: {
      fixture: { type: 'object', properties: {}, required: [], additionalProperties: false },
    },
  },
  fields: {},
  tableDefinition: '',
};

/** Parse through MDC and the same ingress conversion used for Content 3 documents. */
export async function storedDocument(source: string, filename = 'example.md', collection = fixtureCollection): Promise<DatabaseItem> {
  const parsed = await parseMarkdown(source, { highlight: false });
  const document: DatabaseItem = {
    ...parsed.data,
    id: `fixture/${filename}`,
    extension: 'md',
    stem: filename.replace(/\.md$/u, ''),
    body: compressTree(parsed.body),
    meta: {},
  };
  return ensureComarkBody(sanitizeDocumentTree(document, collection));
}

/** Narrow the actual generated content rather than silently accepting unsupported input. */
export function markdownSource(source: string | null): string {
  assert.equal(typeof source, 'string');
  return source as string;
}

/** Apply native formatting only when document comparison and a second pass both agree. */
export async function canonicalMarkdown(source: string, filename: string): Promise<string> {
  const original = await storedDocument(source, filename);
  const formatted = markdownSource(await contentFromDocument(original));
  assert.equal(await isDocumentMatchingContent(formatted, original), true,
    `Native formatting changed document meaning in ${filename}.`);
  const secondPass = markdownSource(await contentFromDocument(await storedDocument(formatted, filename)));
  assert.equal(secondPass, formatted, `Native formatting is not stable in ${filename}.`);
  return formatted;
}
