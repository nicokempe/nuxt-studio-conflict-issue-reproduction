import assert from 'node:assert/strict';
import { runInNewContext } from 'node:vm';
import { expectedFixed, modeLabel } from '../support/mode';
import { declaration, loadNativeBundles } from '../support/native';

interface RegistrationResult {
  editCallbacks: Array<(fsPath: string) => Promise<void>>;
  selectedFiles: string[];
  registrations: { documents: number; media: number; mounts: number; opens: number };
}

/** Executes the shipped initializer; only the SDK, provider and unused UI boundaries are controlled. */
async function inspectRegistration(bundle: string, development: boolean): Promise<RegistrationResult> {
  const initializer = declaration(bundle, 'cY=lN(()=>{', ';var dY=').slice('cY='.length);
  const mounted: Array<() => Promise<void>> = [];
  const editCallbacks: Array<(fsPath: string) => Promise<void>> = [];
  const selectedFiles: string[] = [];
  const registrations = { documents: 0, media: 0, mounts: 0, opens: 0 };
  const activeFeature = { value: 'media' };
  const host = {
    meta: { dev: development, defaultLocale: 'en', ai: { enabled: false } },
    repository: { provider: 'github' },
    user: { get: () => ({ accessToken: 'synthetic-token', email: 'editor@example.test' }) },
    on: {
      mounted: (callback: () => Promise<void>) => mounted.push(callback),
      requestDocumentEdit: (callback: (fsPath: string) => Promise<void>) => editCallbacks.push(callback),
      documentUpdate: () => { registrations.documents++; },
      mediaUpdate: () => { registrations.media++; },
      routeChange: () => {},
      manifestUpdate: () => {},
    },
    app: { registerServiceWorker: async () => {}, requestRerender: () => {}, getManifestId: async () => 'synthetic-manifest' },
  };
  const initialize = runInNewContext(`const cY=${initializer};cY;`, {
    window: { useStudioHost: () => host },
    lN: (create: () => unknown) => create,
    Vt: (value: unknown) => ({ value }),
    gN: () => ({ devMode: { value: development }, enableDevMode: () => {}, preferences: { value: { syncEditorAndRoute: true } }, setManifestId: () => {} }),
    kP: () => ({}),
    wP: () => ({ enabled: false, isOpen: { value: false }, setLocale: () => {}, open: () => { registrations.opens++; } }),
    QU: () => ({ enabled: false }),
    JU: () => ({ load: async () => {} }),
    sY: () => ({ load: async () => {} }),
    lY: () => ({ selectItemByFsPath: async (fsPath: string) => { selectedFiles.push(fsPath); } }),
    pN: { Content: 'content', Media: 'media' },
    dz: () => ({ currentFeature: activeFeature, switchFeature: async (feature: string) => { activeFeature.value = feature; } }),
    Tz: { mount: () => { registrations.mounts++; } },
    Oz: { mount: () => { registrations.mounts++; } },
    Mz: {},
    uz: () => ({ callHook: async () => {} }),
  }, { timeout: 1000 }) as () => unknown;
  initialize();
  assert.equal(mounted.length, 1);
  await mounted[0]!();
  return { editCallbacks, selectedFiles, registrations };
}

const { selected } = await loadNativeBundles();
const production = await inspectRegistration(selected, false);
assert.equal(production.editCallbacks.length, expectedFixed ? 1 : 0, 'Production must expose the exact-file editing callback after the fix.');
assert.equal(production.registrations.mounts, 0, 'Development filesystem watchers must stay disabled in production.');
assert.equal(production.registrations.documents, 0);
assert.equal(production.registrations.media, 0);
if (expectedFixed) {
  await production.editCallbacks[0]!('en/catalog.yml');
  assert.deepEqual(production.selectedFiles, ['en/catalog.yml']);
  assert.equal(production.registrations.opens, 1);
}
const development = await inspectRegistration(selected, true);
assert.equal(development.editCallbacks.length, 1, 'The upstream development path is the control.');
assert.equal(development.registrations.mounts, 2);
console.log(`[${modeLabel}] production exact-file edit callback: ${production.editCallbacks.length}; development: 1.`);
