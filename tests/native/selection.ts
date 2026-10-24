import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { ref } from 'vue';
import { deferred } from '../support/async';
import { expectedFixed, modeLabel } from '../support/mode';
import { declaration, loadNativeBundles } from '../support/native';

interface SelectionDocument { id: string; fsPath: string; extension: string }
interface SelectionDraft { fsPath: string; status: string; modified?: SelectionDocument; original?: SelectionDocument }
interface DraftStore {
  current: { value: SelectionDraft | null };
  list: { value: SelectionDraft[] };
  isLoading: { value: boolean };
  selectByFsPath: (fsPath: string) => Promise<void>;
  unselect: () => Promise<void>;
}

/** Synthetic identities are enough to exercise the native selection and draft creation logic. */
function document(fsPath: string): SelectionDocument {
  return { id: `pages/${fsPath}`, fsPath, extension: fsPath.endsWith('.md') ? 'md' : 'yml' };
}

/** Instantiates the complete native draft base with real Vue refs and controlled storage/network latency. */
function createDraftStore(bundle: string, read: (fsPath: string) => Promise<SelectionDocument | undefined>, fetchFile: (fsPath: string) => Promise<unknown> = async fsPath => ({ path: fsPath, content: `source:${fsPath}`, sha: `sha:${fsPath}` })): DraftStore {
  const stored = new Map<string, SelectionDraft>();
  const instantiate = runInNewContext(`${declaration(bundle, 'function Pz(', 'var zz=')};Pz;`, {
    Vt: ref,
    uz: () => ({ callHook: async () => {} }),
    gN: () => ({ devMode: { value: false } }),
    cP: { Pristine: 'pristine', Updated: 'updated', Created: 'created', Deleted: 'deleted' },
    rP: { Markdown: 'md' },
    lF: (...parts: string[]) => parts.join('/'),
    Nz: async () => null,
  }, { timeout: 1000 }) as (feature: string, host: unknown, provider: unknown, storage: unknown) => DraftStore;
  return instantiate('document', {
    meta: { ai: { enabled: false } },
    document: {
      db: { get: read, upsert: async () => {}, delete: async () => {} },
      utils: { areEqual: async (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right), ensureComarkBody: (value: unknown) => value },
    },
  }, { api: { fetchFile } }, {
    setItem: async (fsPath: string, draft: SelectionDraft) => { stored.set(fsPath, draft); },
    getItem: async (fsPath: string) => stored.get(fsPath),
    getKeys: async () => [...stored.keys()],
    removeItem: async (fsPath: string) => { stored.delete(fsPath); },
  });
}

const { selected } = await loadNativeBundles();
const delayedHome = deferred<SelectionDocument>();
const store = createDraftStore(selected, async fsPath => fsPath === 'home.md' ? delayedHome.promise : document(fsPath));
const earlier = store.selectByFsPath('home.md');
await store.selectByFsPath('catalog.yml');
assert.equal(store.current.value?.fsPath, 'catalog.yml');
delayedHome.resolve(document('home.md'));
await earlier;
assert.equal(store.current.value?.fsPath, expectedFixed ? 'catalog.yml' : 'home.md', 'An older read must not replace a more recent selection.');

const pending = deferred<SelectionDocument>();
const cancelled = createDraftStore(selected, async () => pending.promise);
const abandoned = cancelled.selectByFsPath('home.md');
await cancelled.unselect();
pending.resolve(document('home.md'));
await abandoned;
assert.equal(cancelled.current.value?.fsPath ?? null, expectedFixed ? null : 'home.md', 'Unselect must invalidate a pending selection.');

let remoteRequests = 0;
const sharedRemote = deferred<unknown>();
const shared = createDraftStore(selected, async fsPath => document(fsPath), async () => {
  remoteRequests++;
  return sharedRemote.promise;
});
const first = shared.selectByFsPath('home.md');
const second = shared.selectByFsPath('home.md');
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(remoteRequests, expectedFixed ? 1 : 2, 'Concurrent same-file selections must share draft creation.');
sharedRemote.resolve({ content: 'Synthetic home', sha: 'synthetic-sha' });
await Promise.all([first, second]);
assert.equal(shared.list.value.length, expectedFixed ? 1 : 2);
console.log(`[${modeLabel}] final selected file: ${store.current.value?.fsPath}; concurrent same-file drafts: ${shared.list.value.length}.`);
