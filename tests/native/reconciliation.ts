import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import type { DatabaseItem } from 'nuxt-studio/app';
import { areDocumentsEqual } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/compare.js';
import { contentFromDocument, documentFromYAMLContent } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/generate.js';
import { ensureComarkBody } from '../../node_modules/nuxt-studio/dist/module/runtime/utils/document/legacy.js';
import { deferred } from '../support/async';
import { expectedFixed, modeLabel } from '../support/mode';
import { declaration, loadNativeBundles } from '../support/native';

interface RemoteFile { provider: string; content: string; encoding: string; sha: string }
interface Draft {
  fsPath: string;
  status: string;
  modified: DatabaseItem;
  original: DatabaseItem;
  remoteFile: RemoteFile;
  formattingApplied?: boolean;
  conflict?: { source: string };
}
interface Documents {
  list: { value: Draft[] };
  load: () => Promise<void>;
  update: (path: string, document: DatabaseItem) => Promise<Draft>;
}

const status = { Pristine: 'pristine', Updated: 'updated', Created: 'created', Deleted: 'deleted' };
const fsPath = 'en/catalog.yml';
const current = await documentFromYAMLContent(`pages/${fsPath}`, 'title: Current catalog\n');
const prior = await documentFromYAMLContent(`pages/${fsPath}`, 'title: Earlier catalog\n');
const edited = await documentFromYAMLContent(`pages/${fsPath}`, 'title: Unpublished change\n');
const source = await contentFromDocument(current);
assert.equal(typeof source, 'string');
const { selected } = await loadNativeBundles();
const nativeFactory = `${declaration(selected, 'function Pz(', 'var zz=')}\n${declaration(selected, 'var JU=lN(', 'function ZU(')}\nJU;`;

/** Matches the GitHub Contents transport without using an account or a network request. */
function remote(content = source!): RemoteFile {
  return { provider: 'github', content: Buffer.from(content).toString('base64'), encoding: 'base64', sha: 'synthetic-revision' };
}

/** Models a persisted draft after equivalent canonical formatting has already reached the repository. */
function restoredDraft(): Draft {
  return {
    fsPath, status: status.Updated, modified: structuredClone(current), original: structuredClone(prior),
    remoteFile: remote('title: Earlier catalog\n'), formattingApplied: true,
  };
}

/** Runs the actual native base and document store with native YAML serialization and ordered snapshots. */
function fixture(seed: Draft, fetchRemote: () => Promise<RemoteFile | null> = async () => remote()): { store: Documents; requests: Array<{ cached?: boolean; timeout?: number }> } {
  const stored = new Map([[fsPath, structuredClone(seed)]]);
  const requests: Array<{ cached?: boolean; timeout?: number }> = [];
  let writes: Promise<void> = Promise.resolve();
  const create = runInNewContext(nativeFactory, {
    Vt: (value: unknown) => ({ value }),
    uz: () => ({ callHook: async () => {} }),
    gN: () => ({ devMode: { value: false } }),
    lF: (...parts: string[]) => parts.join('/'),
    Nz: async () => undefined,
    cP: status, rP: { Markdown: 'md' },
    lN: (value: unknown) => value,
    QU: () => ({ enabled: false }),
    NP: (value: string) => value.split('.').at(-1),
    TextEncoder, atob, JSON,
    Tz: {
      getKeys: async () => [...stored.keys()],
      getItem: async (key: string) => structuredClone(stored.get(key)),
      removeItem: async (key: string) => { stored.delete(key); },
      setItem: (key: string, draft: Draft) => {
        const snapshot = JSON.parse(JSON.stringify(draft)) as Draft;
        writes = writes.then(() => { stored.set(key, snapshot); });
        return writes;
      },
    },
  }, { timeout: 1000 }) as (host: unknown, provider: unknown) => Documents;
  const store = create({
    meta: { ai: { enabled: false } },
    document: {
      db: { get: async () => structuredClone(current), upsert: async () => {}, delete: async () => {} },
      utils: { areEqual: areDocumentsEqual, ensureComarkBody },
      generate: { contentFromDocument },
    },
    app: { requestRerender: () => {} },
  }, {
    api: {
      getRepositoryInfo: () => ({ provider: 'github' }),
      fetchFile: async (_path: string, options: { cached?: boolean; timeout?: number }) => {
        requests.push({ ...options });
        return fetchRemote();
      },
    },
  });
  return { store, requests };
}

const unchanged = fixture(restoredDraft());
await unchanged.store.load();
const restored = unchanged.store.list.value[0]!;
assert.equal(restored.status, expectedFixed ? status.Pristine : status.Updated, 'A byte-identical restored draft must not remain an extra publication item.');
assert.equal(restored.formattingApplied, !expectedFixed);
assert.equal(await contentFromDocument(restored.modified), source, 'Cleanup must not rewrite the live document.');
if (expectedFixed) {
  assert.deepEqual(unchanged.requests, [{ cached: false, timeout: 5000 }]);
  assert.notEqual(restored.original, restored.modified, 'A detached baseline preserves later undo behavior.');
  await unchanged.store.update(fsPath, prior);
  assert.equal(restored.status, status.Updated, 'Undo to an older source must still count as a real change.');
}

for (const candidate of [
  { ...restoredDraft(), modified: structuredClone(edited) },
  { ...restoredDraft(), conflict: { source: 'A real upstream conflict' } },
]) {
  const pending = fixture(candidate);
  await pending.store.load();
  assert.equal(pending.store.list.value[0]!.status, status.Updated);
}
const rawDifference = fixture(restoredDraft(), async () => remote(source + '\n'));
await rawDifference.store.load();
assert.equal(rawDifference.store.list.value[0]!.status, status.Updated, 'Even a raw-source formatting difference remains pending.');

if (expectedFixed) {
  const fetching = deferred<undefined>();
  const release = deferred<undefined>();
  const overlapping = fixture(restoredDraft(), async () => {
    fetching.resolve(undefined);
    await release.promise;
    return remote();
  });
  const loading = overlapping.store.load();
  await fetching.promise;
  await overlapping.store.update(fsPath, edited);
  release.resolve(undefined);
  await loading;
  const retained = overlapping.store.list.value[0]!;
  assert.equal(retained.status, status.Updated);
  assert.equal(await contentFromDocument(retained.modified), await contentFromDocument(edited));
}
console.log(`[${modeLabel}] restored byte-identical draft: ${expectedFixed ? 'safely rebased' : 'still counted as changed'}; genuine changes remain pending.`);
