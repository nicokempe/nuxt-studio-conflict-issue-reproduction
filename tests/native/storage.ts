import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { forceCloseDatabase, type IDBFactory } from 'fake-indexeddb';
import { completes, createClock, until } from '../support/async';
import { createDatabaseFixture, get, openDatabase, put } from '../support/database';
import { expectedFixed, modeLabel } from '../support/mode';
import { declaration, hasErrorName, loadNativeBundles } from '../support/native';

type Store = <Value>(mode: IDBTransactionMode, operation: (store: IDBObjectStore) => Value | Promise<Value>) => Promise<Value>;
interface NativeDriver {
  createStore: (name: string, store: string) => Store;
  get: (key: string, store: Store) => Promise<unknown>;
  set: (key: string, value: unknown, store: Store) => Promise<void>;
  keys: (store: Store) => Promise<IDBValidKey[]>;
}

/** Runs the installed native driver against a spec-compliant asynchronous IndexedDB implementation. */
function createDriver(bundle: string, factory: IDBFactory, clock = createClock()): NativeDriver {
  return runInNewContext(`${declaration(bundle, 'function Cz(', 'var Fz=')};({createStore:jz,get:Iz,set:Sz,keys:Ez});`, {
    indexedDB: factory, DOMException, setTimeout: clock.schedule, clearTimeout: clock.cancel,
  }, { timeout: 1000 }) as NativeDriver;
}

const { selected } = await loadNativeBundles();
const incomplete = createDatabaseFixture();
const seeded = await openDatabase(incomplete.factory, 'studio-v1-document', 3, database => database.createObjectStore('existing'));
await put(seeded, 'existing', 'keep', { value: 'preserved' });
seeded.close();
const native = createDriver(selected, incomplete.factory);
const drafts = native.createStore('studio-v1-document', 'drafts');
if (expectedFixed) {
  assert.deepEqual(await completes(native.keys(drafts)), []);
  const recovered = await openDatabase(incomplete.factory, 'studio-v1-document');
  assert.ok(recovered.version > 3);
  assert.equal(recovered.objectStoreNames.contains('drafts'), true);
  assert.deepEqual(await get(recovered, 'existing', 'keep'), { value: 'preserved' });
  recovered.close();
}
else {
  await assert.rejects(native.keys(drafts), error => hasErrorName(error, 'NotFoundError'));
}

const healthy = createDatabaseFixture();
const healthyDatabase = await openDatabase(healthy.factory, 'studio-v1-media', 7, database => database.createObjectStore('drafts'));
await put(healthyDatabase, 'drafts', 'media:image.png', { status: 'created', modified: { title: 'Synthetic draft' } });
healthyDatabase.close();
const healthyDriver = createDriver(selected, healthy.factory);
const media = healthyDriver.createStore('studio-v1-media', 'drafts');
assert.deepEqual(await healthyDriver.get('media:image.png', media), { status: 'created', modified: { title: 'Synthetic draft' } });
const unchanged = await openDatabase(healthy.factory, 'studio-v1-media');
assert.equal(unchanged.version, 7, 'Healthy schemas do not need a version change.');
unchanged.close();

if (expectedFixed) {
  // fake-indexeddb 6.2.5 declares a constructor parameter but accepts a database instance.
  forceCloseDatabase(healthy.connections.at(-2)! as unknown as Parameters<typeof forceCloseDatabase>[0]);
  assert.deepEqual(await healthyDriver.get('media:image.png', media), { status: 'created', modified: { title: 'Synthetic draft' } });
  let operationCalls = 0;
  await assert.rejects(media('readonly', () => {
    operationCalls++;
    throw new Error('Synthetic callback failure.');
  }), /Synthetic callback failure/u);
  assert.equal(operationCalls, 1, 'Connection recovery must never replay an application write callback.');

  const blocked = createDatabaseFixture();
  const blocker = await openDatabase(blocked.factory, 'studio-v1-document', 1);
  const clock = createClock();
  const blockedDriver = createDriver(selected, blocked.factory, clock);
  const failure = assert.rejects(blockedDriver.keys(blockedDriver.createStore('studio-v1-document', 'drafts')), error => hasErrorName(error, 'StudioDraftStorageBlockedError'));
  await until(() => blocked.blocked() > 0);
  clock.fire();
  await failure;
  blocker.close();
}
for (const fixture of [incomplete, healthy]) for (const connection of fixture.connections) connection.close();
console.log(`[${modeLabel}] incomplete draft schema: ${expectedFixed ? 'repaired without deleting records' : 'NotFoundError reproduced'}.`);
