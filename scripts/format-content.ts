import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import type { CollectionInfo } from '@nuxt/content';
import { compressTree } from '@nuxt/content/runtime';
import { parseMarkdown } from '@nuxtjs/mdc/runtime';
import { parseFrontmatter, parseMarkdown as parseComark, type Node as ComarkNode } from 'comark';
import defu from 'defu';
import { normalizeUri } from 'micromark-util-sanitize-uri';
import { pascalCase } from 'scule';
import slugify from 'slugify';
import { isRelative, withLeadingSlash, withoutTrailingSlash } from 'ufo';
import type { DatabaseItem } from 'nuxt-studio/app';
import { describeProperty, getOrderedSchemaKeys } from '../node_modules/@nuxt/content/dist/runtime/internal/schema.js';
import { generateIdFromFsPath, getCollectionByFilePath } from '../node_modules/nuxt-studio/dist/module/runtime/utils/collection.js';
import { contentFromDocument } from '../node_modules/nuxt-studio/dist/module/runtime/utils/document/generate.js';
import { ensureComarkBody } from '../node_modules/nuxt-studio/dist/module/runtime/utils/document/legacy.js';
import { applyCollectionSchema } from '../node_modules/nuxt-studio/dist/module/runtime/utils/document/schema.js';
import { sanitizeDocumentTree } from '../node_modules/nuxt-studio/dist/module/runtime/utils/document/tree.js';

/** Actual private Content transformers needed for this fixture application's database rows. */
interface ContentPipeline {
  markdown: { parse: (file: { id: string, body: string }, options: { compress: boolean }) => Promise<DatabaseItem> }
  pathMetaTransformer: { transform: (document: DatabaseItem) => DatabaseItem }
}

/** Candidate writes are collected only after every file passes preservation checks. */
interface FormattedFile {
  filename: string
  source: string
  formatted: string
}

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const contentRoot = resolve(repositoryRoot, 'content');
const reservedMetadata = new Set(['id', 'fsPath', 'stem', 'extension', '__hash__', 'path', 'body', 'meta', 'rawbody']);
const mode = process.argv[2];
assert.ok(mode === '--check' || mode === '--write', 'Use --check or --write.');

/** Narrow a plain mapping without converting values. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && !(value instanceof Date);
}

/** Evaluate the installed Markdown, path and link definitions, rather than copying their algorithms. */
async function loadContentPipeline(): Promise<ContentPipeline> {
  const source = await readFile(resolve(repositoryRoot, 'node_modules/@nuxt/content/dist/module.mjs'), 'utf8');
  const start = source.indexOf('const SEMVER_REGEX = ');
  const end = source.indexOf('\nconst yaml = defineTransformer({', start);
  assert.ok(start >= 0 && end > start, 'Content 3.16.2 transformer boundaries changed.');
  const evaluate = new Function('defineTransformer', 'parseMarkdown', 'fromHast', 'defu$1', 'slugify', 'pascalCase',
    'isRelative', 'withLeadingSlash', 'withoutTrailingSlash', 'normalizeUri',
    `"use strict";\n${source.slice(start, end)}\nreturn { markdown, pathMetaTransformer };`) as (...dependencies: unknown[]) => ContentPipeline;
  return evaluate((definition: unknown): unknown => definition, parseMarkdown, compressTree, defu, slugify,
    pascalCase, isRelative, withLeadingSlash, withoutTrailingSlash, normalizeUri);
}

/** Use generated application schemas, including hidden fields and defaults. */
async function loadCollections(): Promise<Record<string, CollectionInfo>> {
  const metadata: unknown = await import(pathToFileURL(resolve(repositoryRoot, '.nuxt/content/preview.mjs')).href);
  assert.ok(isRecord(metadata) && isRecord(metadata.collections), 'Run bun run prepare before formatting.');
  return metadata.collections as Record<string, CollectionInfo>;
}

/** Materialize the fixture schemas' VARCHAR/JSON/boolean defaults as Content's query rows do. */
async function createRow(source: string, filename: string, collection: CollectionInfo, pipeline: ContentPipeline): Promise<DatabaseItem> {
  const id = generateIdFromFsPath(filename, collection);
  const parsed = await pipeline.markdown.parse({ id, body: source }, { compress: true });
  const withPath = pipeline.pathMetaTransformer.transform(parsed);
  const document = applyCollectionSchema(id, collection, { ...withPath, meta: {} });
  const row: Record<string, unknown> = {};
  for (const key of getOrderedSchemaKeys(collection.schema)) {
    const property = describeProperty(collection.schema, key);
    const supplied: unknown = document[key];
    const value: unknown = supplied === undefined || String(supplied) === 'null' ? property.default ?? null : supplied;
    if (collection.fields[key] === 'boolean') row[key] = Boolean(value);
    else if (value === null) row[key] = null;
    else if (property.json) row[key] = JSON.parse(JSON.stringify(value)) as unknown;
    else {
      assert.equal(property.sqlType, 'VARCHAR', 'This formatter is scoped to the fixture schemas, not arbitrary SQL types.');
      row[key] = String(value);
    }
  }
  return row as DatabaseItem;
}

/** Preserve every effective field before hiding editor-only metadata. */
function effectiveMetadata(document: DatabaseItem): Record<string, unknown> {
  return Object.fromEntries([
    ...Object.entries(document),
    ...Object.entries(document.meta ?? {}),
  ].filter(([key]) => !reservedMetadata.has(key)));
}

/** Remove only inherited SEO duplicates and the default navigation flag from authored metadata. */
function authoredMetadata(value: Record<string, unknown>): Record<string, unknown> {
  const metadata = structuredClone(value);
  if (isRecord(metadata.seo)) {
    for (const key of ['title', 'description']) {
      if (metadata.seo[key] === metadata[key]) Reflect.deleteProperty(metadata.seo, key);
    }
    if (Object.keys(metadata.seo).length === 0) Reflect.deleteProperty(metadata, 'seo');
  }
  if (metadata.navigation === true || metadata.navigation === 'true') Reflect.deleteProperty(metadata, 'navigation');
  return metadata;
}

/** Ignore only invisible empty text and whitespace immediately before a hard break. */
function semanticBody(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(semanticBody);
  if (!isRecord(value)) return value;
  const result: Record<string, unknown> = Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, semanticBody(entry)]));
  if (result.type === 'element' && Array.isArray(result.children)) {
    const children: unknown[] = result.children;
    result.children = children.map((child, index) => {
      const next = children[index + 1];
      return isRecord(child) && child.type === 'text' && typeof child.value === 'string' && isRecord(next) && next.tag === 'br'
        ? { ...child, value: child.value.replace(/[ \t]+$/u, '') }
        : child;
    }).filter(child => !(isRecord(child) && child.type === 'text' && child.value === ''));
  }
  return result;
}

/** Record literal code separately, because MDC expands tabs during parsing. */
async function codeFacts(source: string): Promise<unknown[]> {
  const tree = await parseComark(source, { autoClose: false, linkify: false });
  const facts: unknown[] = [];
  function text(node: ComarkNode): string {
    return typeof node === 'string' ? node : node.slice(2).map(child => text(child as ComarkNode)).join('');
  }
  function visit(node: ComarkNode): void {
    if (typeof node === 'string') return;
    if (node[0] === 'pre') facts.push({ text: text(node), attributes: node[1] });
    for (const child of node.slice(2)) visit(child as ComarkNode);
  }
  for (const node of tree.nodes) visit(node);
  return facts;
}

/** Serialize exactly the form document obtained from a prepared Content row. */
async function serialize(row: DatabaseItem, collection: CollectionInfo): Promise<string> {
  const source = await contentFromDocument(ensureComarkBody(sanitizeDocumentTree(structuredClone(row), collection)));
  assert.equal(typeof source, 'string', 'Studio must serialize the Markdown file.');
  return source as string;
}

const collections = await loadCollections();
const pipeline = await loadContentPipeline();
const filenames = (await readdir(contentRoot, { recursive: true })).filter(filename => filename.endsWith('.md')).sort();
const files: FormattedFile[] = [];
for (const filename of filenames) {
  const collection = getCollectionByFilePath(filename, collections);
  assert.ok(collection, `${filename}: no matching collection.`);
  const source = await readFile(resolve(contentRoot, filename), 'utf8');
  const before = await createRow(source, filename, collection, pipeline);
  const formatted = await serialize(before, collection);
  const after = await createRow(formatted, filename, collection, pipeline);
  const authoredBefore = authoredMetadata(parseFrontmatter(source).data);
  const authoredAfter = authoredMetadata(parseFrontmatter(formatted).data);
  for (const [key, value] of Object.entries(authoredBefore)) {
    assert.ok(isDeepStrictEqual(value, authoredAfter[key]), `${filename}: authored ${key} would change.`);
  }
  assert.deepEqual(effectiveMetadata(after), effectiveMetadata(before), `${filename}: effective metadata would change.`);
  const [parsedBefore, parsedAfter] = await Promise.all([
    parseMarkdown(source, { highlight: false }), parseMarkdown(formatted, { highlight: false }),
  ]);
  assert.deepEqual(semanticBody(parsedAfter.body), semanticBody(parsedBefore.body), `${filename}: rendered content would change.`);
  assert.deepEqual(await codeFacts(formatted), await codeFacts(source), `${filename}: literal code would change.`);
  assert.equal(await serialize(after, collection), formatted, `${filename}: second serialization is unstable.`);
  files.push({ filename, source, formatted });
}

const changed = files.filter(file => file.source !== file.formatted);
if (mode === '--check') {
  assert.equal(changed.length, 0, `Run bun run content:format for: ${changed.map(file => file.filename).join(', ')}`);
} else {
  for (const file of changed) await writeFile(resolve(contentRoot, file.filename), file.formatted);
}
console.log(`Native Studio formatting ${mode === '--check' ? 'checked' : 'applied'}: ${files.length} Markdown files, ${changed.length} changed. Metadata, rendered content, literal code and second-pass stability verified.`);
