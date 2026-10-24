import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { BaseTransition, Suspense, createRenderer, defineComponent, h, nextTick, shallowRef, type Component } from 'vue';
import type { DatabaseItem, StudioHost } from 'nuxt-studio/app';
import type { RouteLocationNormalized } from 'vue-router';
import { contentSourcePath } from '../../app/utils/validators';
import { expectedFixed, modeLabel } from '../support/mode';

/** Structural contract of the actual fixed app's render lifecycle. */
interface PageLifecycle {
  start: () => void
  leave: () => void
  finish: () => Promise<void>
  afterLeave: () => Promise<void>
}

/** Structural browser boundary injected into the actual adapter. */
interface AdapterEnvironment {
  route: () => RouteLocationNormalized
  targets: () => Array<{ fsPath: string, title: string }>
  open: () => boolean
  preferences: () => unknown
  afterPage: (callback: () => Promise<void>) => void
  afterPreference: (callback: () => Promise<void>) => void
}

interface AdapterModule {
  createFixturePageLifecycle: (notify: () => Promise<void>) => PageLifecycle
  connectFixtureStudio: (host: StudioHost, environment: AdapterEnvironment) => void
}

// Content's page IDs omit the source prefix, while data IDs retain it.
assert.equal(contentSourcePath('pages_en/index.md'), 'locales/en/index.md');
assert.equal(contentSourcePath('pages_de/article.md'), 'locales/de/article.md');
assert.equal(contentSourcePath('catalog_en/locales/en/globals/catalog.yml'), 'locales/en/globals/catalog.yml');
assert.equal(contentSourcePath(undefined), '');

const adapterUrl = new URL('../../app/utils/studio-page-context.ts', import.meta.url);
if (!expectedFixed) {
  assert.equal(existsSync(fileURLToPath(adapterUrl)), false, 'Upstream fixture has no custom route-follow integration.');
  console.log(`[${modeLabel}] Exact page/data identities verified; automatic page-follow adapter is intentionally absent.`);
}
else {
  const adapter = await import(adapterUrl.href) as AdapterModule;
  await verifySelection(adapter);
  await verifyVueLifecycle(adapter);
  console.log(`[${modeLabel}] Actual app adapter follows exact files, respects preferences and waits for real Vue leaves.`);
}

/** Supplies a normalized public route without introducing router behavior into the test. */
function route(path: string): RouteLocationNormalized {
  return { path, fullPath: path, params: { locale: path.split('/')[1] ?? 'en' }, query: {}, hash: '', matched: [], meta: {}, name: undefined, redirectedFrom: undefined };
}

/** Executes actual selection logic; only the SDK transport and browser state are controlled. */
async function verifySelection(adapter: AdapterModule): Promise<void> {
  let currentRoute = route('/en');
  let target: { fsPath: string, title: string } | undefined = { fsPath: 'locales/en/index.md', title: 'Home' };
  let sidebarOpen = false;
  let preferences: unknown = { syncEditorAndRoute: true };
  const afterPage: Array<() => Promise<void>> = [];
  const afterPreference: Array<() => Promise<void>> = [];
  const selected: string[] = [];
  const navigated: string[] = [];
  const nativeRegistrations: Array<(fsPath: string) => Promise<void>> = [];
  let nativeRouteRegistrations = 0;
  const boundary = {
    document: { db: { list: async (): Promise<DatabaseItem[]> => [] }, utils: { detectActives: () => [] } },
    on: {
      requestDocumentEdit: (callback: (fsPath: string) => Promise<void>) => { nativeRegistrations.push(callback); },
      routeChange: () => { nativeRouteRegistrations++; },
    },
    ui: { expandSidebar: () => { sidebarOpen = true; } },
    app: { navigateTo: (path: string) => { navigated.push(path); } },
  };
  // Unused SDK methods are deliberately absent, so unexpected protocol access fails immediately.
  const host = boundary as unknown as StudioHost;
  const environment: AdapterEnvironment = {
    route: () => currentRoute,
    targets: () => target ? [target] : [],
    open: () => sidebarOpen,
    preferences: () => preferences,
    afterPage: callback => { afterPage.push(callback); },
    afterPreference: callback => { afterPreference.push(callback); },
  };
  adapter.connectFixtureStudio(host, environment);
  adapter.connectFixtureStudio(host, environment);
  assert.equal(afterPage.length, 1, 'Decorating a host twice cannot duplicate callbacks.');
  host.on.requestDocumentEdit(async fsPath => {
    selected.push(fsPath);
    host.app.navigateTo('/catalog/detail');
  });
  host.on.routeChange(async () => {});
  assert.equal(nativeRegistrations.length, 1, 'The native edit button keeps its registered callback.');
  assert.equal(nativeRouteRegistrations, 0, 'Route notifications wait for completed page rendering.');
  await host.document.db.list();
  await afterPage[0]!();
  assert.deepEqual(selected, [], 'Ordinary navigation never opens a closed editor.');
  sidebarOpen = true;
  await afterPage[0]!();
  assert.deepEqual(selected, ['locales/en/index.md']);
  currentRoute = route('/en/catalog/example-product');
  target = { fsPath: 'locales/en/globals/catalog.yml', title: 'Product' };
  await afterPage[0]!();
  assert.equal(selected.at(-1), 'locales/en/globals/catalog.yml');
  assert.deepEqual(navigated, [], 'Exact selection cannot navigate to a shared layout URL.');
  preferences = { syncEditorAndRoute: false };
  await afterPreference[0]!();
  currentRoute = route('/de/article');
  target = { fsPath: 'locales/de/article.md', title: 'Article' };
  await afterPage[0]!();
  assert.equal(selected.at(-1), 'locales/en/globals/catalog.yml', 'Disabled synchronization retains manual selection.');
  preferences = { syncEditorAndRoute: true };
  await afterPreference[0]!();
  assert.equal(selected.at(-1), 'locales/de/article.md', 'Re-enabling synchronization immediately selects the current file.');
  const beforeMissingTarget = selected.length;
  currentRoute = route('/de/missing');
  target = undefined;
  await afterPage[0]!();
  assert.equal(selected.length, beforeMissingTarget, 'A page without a source never issues an empty-path edit request.');
  sidebarOpen = false;
  currentRoute = route('/de');
  target = { fsPath: 'locales/de/index.md', title: 'Home' };
  await afterPage[0]!();
  assert.equal(selected.length, beforeMissingTarget);
  host.ui.expandSidebar();
  await afterPage[0]!();
  await Promise.resolve();
  assert.equal(selected.at(-1), 'locales/de/index.md', 'Reopening the sidebar selects the currently rendered source.');
}

/** Minimal host node consumed by Vue's real renderer rather than a simulated lifecycle. */
interface RendererNode {
  kind: string
  text: string
  parent: RendererNode | null
  children: RendererNode[]
}

/** Creates an in-memory host node; no DOM emulator or browser session is involved. */
function node(kind: string, text = ''): RendererNode {
  return { kind, text, parent: null, children: [] };
}

/** Removes an actual Vue host node while retaining sibling identity. */
function removeNode(value: RendererNode): void {
  if (value.parent) value.parent.children.splice(value.parent.children.indexOf(value), 1);
  value.parent = null;
}

/** Verifies the real Suspense/BaseTransition ordering that previously caused premature selection. */
async function verifyVueLifecycle(adapter: AdapterModule): Promise<void> {
  const renderer = createRenderer<RendererNode, RendererNode>({
    insert: (value, parent, anchor = null) => {
      removeNode(value);
      const position = anchor ? parent.children.indexOf(anchor) : -1;
      if (position < 0) parent.children.push(value);
      else parent.children.splice(position, 0, value);
      value.parent = parent;
    },
    remove: removeNode,
    createElement: kind => node(kind),
    createText: text => node('text', text),
    createComment: text => node('comment', text),
    setText: (value, text) => { value.text = text; },
    setElementText: (value, text) => { value.text = text; value.children = []; },
    parentNode: value => value.parent,
    nextSibling: value => value.parent?.children[value.parent.children.indexOf(value) + 1] ?? null,
    patchProp: () => {},
  });
  const root = node('root');
  const selectedContent: string[] = [];
  const lifecycle = adapter.createFixturePageLifecycle(async () => { selectedContent.push(root.children[0]?.text ?? ''); });
  let completedRender: () => void = () => {};
  let finishLeave: (() => void) | undefined;
  let resolveIncoming: () => void = () => {};
  const incoming = new Promise<void>(resolve => { resolveIncoming = resolve; });
  const home = defineComponent({ name: 'ExampleHome', setup: () => () => h('div', 'home') });
  const next = defineComponent({ name: 'ExampleNext', async setup() { await incoming; return () => h('div', 'next'); } });
  const page = shallowRef<Component>(home);
  const app = renderer.createApp(defineComponent({
    setup: () => () => h(BaseTransition, {
      mode: 'out-in',
      onBeforeLeave: lifecycle.leave,
      onLeave: (_element: Element, done: () => void) => { finishLeave = done; },
      onAfterLeave: () => { void lifecycle.afterLeave(); },
    }, { default: () => h(Suspense, {
      onPending: lifecycle.start,
      onResolve: async () => { await nextTick(); await lifecycle.finish(); completedRender(); },
    }, { default: () => h(page.value, { key: page.value.name }) }) }),
  }));
  const first = new Promise<void>(resolve => { completedRender = resolve; });
  app.mount(root);
  await first;
  assert.deepEqual(selectedContent, ['home']);
  const second = new Promise<void>(resolve => { completedRender = resolve; });
  page.value = next;
  await nextTick();
  resolveIncoming();
  await second;
  assert.equal(root.children[0]?.text, 'home', 'Suspense resolves while the outgoing DOM is still present.');
  assert.deepEqual(selectedContent, ['home'], 'Selection waits for the real outgoing leave.');
  assert.ok(finishLeave);
  finishLeave();
  await nextTick();
  assert.deepEqual(selectedContent, ['home', 'next']);
  lifecycle.start();
  await lifecycle.finish();
  assert.deepEqual(selectedContent, ['home', 'next', 'next'], 'A render without a leave cannot wait for a phantom transition.');
  app.unmount();
}
