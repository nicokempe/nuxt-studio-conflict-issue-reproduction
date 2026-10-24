import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { runInNewContext } from 'node:vm';
import type { IDBFactory } from 'fake-indexeddb';
import { computed, ref, watch } from 'vue';
import { completes, createClock, deferred, until } from '../support/async';
import { createDatabaseFixture, get, openDatabase, put } from '../support/database';
import { expectedFixed, modeLabel } from '../support/mode';
import { declaration, hasErrorName, loadNativeBundles, studioPackageRoot } from '../support/native';

interface Bootstrap {
  start: () => Promise<void>;
  isReady: () => boolean;
  events: string[];
}

/** Executes the real unstorage facade, draft stores, file tree and native initializer. */
function createBootstrap(bundle: string, database: ReturnType<typeof createDatabaseFixture>, registerWorker: () => Promise<void>, clock?: ReturnType<typeof createClock>): Bootstrap {
  const mounted: Array<() => Promise<void>> = [];
  const events: string[] = [];
  const hooks = new Map<string, Array<(payload: unknown) => Promise<void>>>();
  const hookable = {
    hook: (name: string, callback: (payload: unknown) => Promise<void>): void => {
      hooks.set(name, [...hooks.get(name) ?? [], callback]);
    },
    callHook: async (name: string, payload: unknown): Promise<void> => {
      events.push(name);
      for (const callback of hooks.get(name) ?? []) await callback(payload);
    },
  };
  const home = { id: 'pages/en/index.md', fsPath: 'en/index.md', path: '/', extension: 'md', stem: 'index', title: 'Synthetic home' };
  const host = {
    meta: { dev: false, defaultLocale: 'en', ai: { enabled: false }, media: { external: false } },
    repository: { provider: 'github' },
    user: { get: () => ({ accessToken: 'synthetic-token', email: 'editor@example.test' }) },
    on: {
      mounted: (callback: () => Promise<void>): void => { mounted.push(callback); },
      requestDocumentEdit: () => {}, routeChange: () => {}, manifestUpdate: () => {},
    },
    ui: { expandSidebar: () => {} },
    document: {
      db: { list: async () => [home], get: async () => home, upsert: async () => {}, delete: async () => {} },
      utils: {
        areEqual: async (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right),
        ensureComarkBody: (value: unknown) => value,
        detectActives: () => [{ fsPath: home.fsPath, title: home.title }],
      },
      generate: { contentFromDocument: async (value: unknown) => JSON.stringify(value) },
    },
    media: { list: async () => [] },
    app: {
      registerServiceWorker: () => { events.push('worker:register'); return registerWorker(); },
      requestRerender: () => {}, getManifestId: async () => 'synthetic-manifest', navigateTo: () => {},
    },
  };
  const source = [
    declaration(bundle, 'function pz(', 'async function Nz('),
    declaration(bundle, 'function OP(', 'var XP='),
    declaration(bundle, 'async function Nz(', 'var zz='),
    declaration(bundle, 'var JU=lN(', 'function ZU('),
    declaration(bundle, 'var oY=', ',lY=(e,t,n)=>'),
    'const ' + declaration(bundle, 'lY=(e,t,n)=>', ',cY=lN(') + ';',
    'const ' + declaration(bundle, 'cY=lN(()=>{', ';var dY=') + ';cY();',
  ].join('\n');
  const studio = runInNewContext(source, {
    indexedDB: database.factory, DOMException, setTimeout: clock?.schedule ?? setTimeout, clearTimeout: clock?.cancel ?? clearTimeout,
    window: { useStudioHost: () => host }, console: { info: () => {} },
    Vt: ref, ms: computed, na: watch, uz: () => hookable,
    gN: () => ({ devMode: { value: false }, enableDevMode: () => {}, preferences: { value: { syncEditorAndRoute: true } }, setManifestId: () => {}, setLocation: () => {} }),
    lN: (create: (...arguments_: unknown[]) => unknown) => {
      let created: unknown;
      return (...arguments_: unknown[]) => created ??= create(...arguments_);
    },
    cP: { Pristine: 'pristine', Updated: 'updated', Created: 'created', Deleted: 'deleted' }, rP: { Markdown: 'md' },
    dP: { Opened: 'opened', Updated: 'updated', Created: 'created', Deleted: 'deleted', Renamed: 'renamed' },
    pN: { Content: 'content', Media: 'media', AI: 'ai' },
    QU: () => ({ enabled: false, contextFolder: '' }),
    kP: () => ({ api: { getRepositoryInfo: () => ({ provider: 'github' }) } }),
    wP: () => ({ isOpen: { value: false }, setLocale: () => {}, open: () => {} }),
    dz: () => ({ currentFeature: { value: 'content' } }),
    oP: { withTag: () => ({}) }, aY: () => ({ showError: () => {} }),
    BN: (value: unknown) => typeof value === 'string' ? JSON.parse(value) as unknown : value,
    lF: (...parts: string[]) => parts.join('/'),
  }, { timeout: 1000 }) as { isReady: { value: boolean } };
  assert.equal(mounted.length, 1);
  return { events, start: mounted[0]!, isReady: () => studio.isReady.value };
}

const { selected } = await loadNativeBundles();
const registration = deferred<undefined>();
const database = createDatabaseFixture();
const bootstrap = createBootstrap(selected, database, () => registration.promise);
const started = bootstrap.start();
if (expectedFixed) {
  await Promise.resolve();
  await Promise.resolve();
  assert.deepEqual(bootstrap.events, ['worker:register']);
  assert.equal(database.opens(), 0, 'A pending worker update must precede draft database access.');
  assert.equal(bootstrap.isReady(), false);
}
else {
  await until(() => bootstrap.events.includes('studio:draft:media:updated'));
  assert.ok(database.opens() > 0, 'Upstream begins draft loading before worker registration settles.');
}
registration.resolve(undefined);
await completes(started);
assert.equal(bootstrap.isReady(), true);
assert.ok(bootstrap.events.includes('studio:draft:document:updated'));
assert.ok(bootstrap.events.includes('studio:draft:media:updated'));
for (const connection of database.connections) connection.close();

interface WorkerModule { serviceWorker: () => string }

/** Runs the installed reader, leaving the shared database connection alive exactly as a worker does. */
function workerReader(source: string, factory: IDBFactory): { getData: (key: string) => Promise<unknown> } {
  return runInNewContext(`${source};({getData});`, {
    indexedDB: factory, self: { addEventListener: () => {} },
    URL, Request, Response, Uint8Array, atob, setTimeout, clearTimeout,
    console: { log: () => {} },
  }, { timeout: 1000 }) as { getData: (key: string) => Promise<unknown> };
}

const installed = await import(pathToFileURL(`${studioPackageRoot}/dist/app/service-worker.js`).href) as WorkerModule;
let legacyWorkerSource = installed.serviceWorker();
if (expectedFixed) {
  const patch = await readFile(new URL('../../patches/nuxt-studio@1.8.0.patch', import.meta.url), 'utf8');
  const workerDiff = patch.split('diff --git ').find(part => part.split('\n')[0]?.endsWith(' b/dist/app/service-worker.js'));
  assert.ok(workerDiff, 'Keep the removed upstream worker as an executable failure control.');
  const originalModule = workerDiff.split('\n').filter(line => line.startsWith('-') && !line.startsWith('---')).map(line => line.slice(1)).join('\n');
  assert.ok(originalModule.includes('export{n as serviceWorker};'));
  legacyWorkerSource = runInNewContext(originalModule.replace('export{n as serviceWorker};', ';n();'), {}, { timeout: 1000 }) as string;
}

// A shared worker connection reproduces the missing-toolbar startup failure across real native stores.
const lockedDatabase = createDatabaseFixture();
const emptyMedia = await openDatabase(lockedDatabase.factory, 'studio-v1-media', 1);
emptyMedia.close();
await assert.rejects(workerReader(legacyWorkerSource, lockedDatabase.factory).getData('missing'), error => hasErrorName(error, 'NotFoundError'));
const blockedClock = createClock();
const blockedBootstrap = createBootstrap(selected, lockedDatabase, async () => {}, blockedClock);
const failedStartup = assert.rejects(blockedBootstrap.start(), error => hasErrorName(error, expectedFixed ? 'StudioDraftStorageBlockedError' : 'NotFoundError'));
if (expectedFixed) {
  await until(() => lockedDatabase.blocked() > 0);
  blockedClock.fire();
}
await failedStartup;
assert.equal(blockedBootstrap.isReady(), false, 'The original worker-held connection prevents native readiness.');
assert.ok(blockedBootstrap.events.includes('studio:draft:document:updated'));
assert.equal(blockedBootstrap.events.includes('studio:draft:media:updated'), false);
for (const connection of lockedDatabase.connections) connection.close();

if (expectedFixed) {
  const repairedDatabase = createDatabaseFixture();
  const partial = await openDatabase(repairedDatabase.factory, 'studio-v1-media', 3, target => target.createObjectStore('other'));
  await put(partial, 'other', 'keep', { value: 'preserved' });
  partial.close();
  const reader = workerReader(installed.serviceWorker(), repairedDatabase.factory);
  assert.equal(await completes(reader.getData('missing')), undefined);
  const inspected = await openDatabase(repairedDatabase.factory, 'studio-v1-media');
  assert.deepEqual(await get(inspected, 'other', 'keep'), { value: 'preserved' });
  inspected.close();
  const repairedBootstrap = createBootstrap(selected, repairedDatabase, async () => {});
  await completes(repairedBootstrap.start());
  assert.equal(repairedBootstrap.isReady(), true, 'Both repaired database users allow full native startup.');
  for (const connection of repairedDatabase.connections) connection.close();
}

/** Minimal public worker lifecycle surface consumed by the actual SDK activation helper. */
class FixtureWorker extends EventTarget {
  constructor(readonly scriptURL: string, public state: ServiceWorkerState) { super(); }

  /** Emits a browser lifecycle transition after registration fields change. */
  transition(state: ServiceWorkerState): void { this.state = state; this.dispatchEvent(new Event('statechange')); }
}

class FixtureRegistration extends EventTarget {
  installing: FixtureWorker | null = null;
  waiting: FixtureWorker | null = null;
  active: FixtureWorker | null = null;
}

class FixtureContainer extends EventTarget {
  controller: FixtureWorker | null = null;
  readonly calls: Array<{ path: string; options: RegistrationOptions }> = [];

  constructor(private readonly registration: FixtureRegistration) { super(); }

  /** Records the SDK's arguments while activation remains deterministic. */
  async register(path: string, options: RegistrationOptions): Promise<FixtureRegistration> {
    this.calls.push({ path, options });
    return this.registration;
  }
}

if (expectedFixed) {
  const sdk = await readFile(`${studioPackageRoot}/dist/module/runtime/host.js`, 'utf8');
  const helper = declaration(sdk, 'async function registerStudioServiceWorker(', 'export function useStudioHost(');
  const workerRegistration = new FixtureRegistration();
  const oldWorker = new FixtureWorker('https://example.test/sw.js?v0.0.5', 'activated');
  const newWorker = new FixtureWorker('https://example.test/sw.js?v0.0.6', 'installing');
  workerRegistration.active = oldWorker;
  workerRegistration.installing = newWorker;
  const container = new FixtureContainer(workerRegistration);
  container.controller = oldWorker;
  const clock = createClock();
  const register = runInNewContext(`${helper};registerStudioServiceWorker;`, {
    navigator: { serviceWorker: container }, window: { location: { href: 'https://example.test/en/' } }, URL,
    setTimeout: clock.schedule, clearTimeout: clock.cancel,
  }, { timeout: 1000 }) as (path: string) => Promise<void>;
  let ready = false;
  const update = register('/sw.js?v0.0.6').then(() => { ready = true; });
  await until(() => container.calls.length === 1);
  assert.equal(container.calls[0]?.options.updateViaCache, 'none');
  assert.equal(ready, false, 'An older active worker does not satisfy readiness.');
  workerRegistration.installing = null;
  workerRegistration.active = newWorker;
  newWorker.transition('activated');
  await Promise.resolve();
  assert.equal(ready, false, 'The old controller must release its context before draft upgrades.');
  container.controller = newWorker;
  container.dispatchEvent(new Event('controllerchange'));
  await completes(update);
  assert.equal(clock.pending(), 0);
  container.controller = null;
  await completes(register('/sw.js?v0.0.6'));
  assert.equal(clock.pending(), 0, 'A hard refresh may legitimately have no controller.');
}
console.log(`[${modeLabel}] worker registration ${expectedFixed ? 'precedes' : 'races'} native draft initialization.`);
