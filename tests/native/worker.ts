import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { IDBFactory } from 'fake-indexeddb';
import { completes } from '../support/async';
import { createDatabaseFixture, get, openDatabase, put } from '../support/database';
import { expectedFixed, modeLabel } from '../support/mode';
import { hasErrorName, studioPackageRoot } from '../support/native';

interface WorkerModule { serviceWorker: () => string }
interface WorkerReader {
  getData: (key: string) => Promise<unknown>;
  fetchFromIndexedDB: (event: { request: Request }, url: string) => Promise<Response>;
}

/** Executes the installed media worker body with real IndexedDB behavior and no network fallback. */
function createWorker(source: string, factory: IDBFactory): WorkerReader {
  return runInNewContext(`${source};({getData,fetchFromIndexedDB});`, {
    indexedDB: factory,
    self: { addEventListener: () => {} },
    URL, Request, Response, Uint8Array, atob, setTimeout, clearTimeout,
    fetch: () => { throw new Error('Unexpected network fallback for local draft media.'); },
    console: { log: () => {} },
  }, { timeout: 1000 }) as WorkerReader;
}

const moduleUrl = pathToFileURL(`${studioPackageRoot}/dist/app/service-worker.js`);
const installedWorker = await import(moduleUrl.href) as WorkerModule;
const body = installedWorker.serviceWorker();

const upgraded = createDatabaseFixture();
const media = await openDatabase(upgraded.factory, 'studio-v1-media', 2, database => database.createObjectStore('drafts'));
const draft = JSON.stringify({ status: 'created', modified: { raw: 'data:image/png;base64,AQID' } });
await put(media, 'drafts', 'media:image.png', draft);
media.close();
const reader = createWorker(body, upgraded.factory);
if (expectedFixed) {
  const response = await completes(reader.fetchFromIndexedDB({ request: new Request('https://example.test/media/image.png') }, '/media/image.png'));
  assert.equal(response.headers.get('content-type'), 'image/png');
  assert.deepEqual([...new Uint8Array(await response.arrayBuffer())], [1, 2, 3]);
  const next = await completes(openDatabase(upgraded.factory, 'studio-v1-media', 3));
  assert.equal(await get(next, 'drafts', 'media:image.png'), draft);
  next.close();
}
else {
  await assert.rejects(reader.getData('media:image.png'), error => hasErrorName(error, 'VersionError'));
}

const incomplete = createDatabaseFixture();
const empty = await openDatabase(incomplete.factory, 'studio-v1-media', 1);
empty.close();
const incompleteReader = createWorker(body, incomplete.factory);
if (expectedFixed) {
  assert.equal(await completes(incompleteReader.getData('missing')), undefined);
  const next = await completes(openDatabase(incomplete.factory, 'studio-v1-media', 3));
  assert.equal(next.objectStoreNames.contains('drafts'), true);
  next.close();
}
else {
  await assert.rejects(incompleteReader.getData('missing'), error => hasErrorName(error, 'NotFoundError'));
  await assert.rejects(openDatabase(incomplete.factory, 'studio-v1-media', 2), /Database upgrade blocked/u);
  // Release the exact leaked connection to let the queued upgrade finish cleanly.
  for (const connection of incomplete.connections) connection.close();
}
for (const fixture of [upgraded, incomplete]) for (const connection of fixture.connections) connection.close();
console.log(`[${modeLabel}] media worker: ${expectedFixed ? 'reads upgraded schema and releases connections' : 'VersionError and leaked connection reproduced'}.`);
