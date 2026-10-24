import type { StudioHost, UseStudioHost } from 'nuxt-studio/app';
import type { RouteLocationNormalized } from 'vue-router';
import { isFixtureContentPath, resolveFixtureLocale, studioSynchronizationEnabled } from './validators';

/** Public SDK callback used by Studio's actual document store. */
type EditCallback = Parameters<StudioHost['on']['requestDocumentEdit']>[0];
/** Public SDK callback normally triggered before the new page has rendered. */
type RouteCallback = Parameters<StudioHost['on']['routeChange']>[0];

/** Signals real page and transition events without inferring phantom outgoing leaves. */
export interface FixturePageLifecycle {
  start: () => void
  leave: () => void
  finish: () => Promise<void>
  afterLeave: () => Promise<void>
}

/** Browser dependencies kept outside the selection adapter. */
export interface FixtureStudioEnvironment {
  route: () => RouteLocationNormalized
  targets: () => Array<{ fsPath: string, title: string }>
  open: () => boolean
  preferences: () => unknown
  afterPage: (callback: () => Promise<void>) => void
  afterPreference: (callback: () => Promise<void>) => void
}

const connectedHosts = new WeakSet<StudioHost>();

/** Notifies once the page has resolved and an actual outgoing transition has finished. */
export function createFixturePageLifecycle(notify: () => Promise<void>): FixturePageLifecycle {
  let resolved = false;
  let leaving = false;
  let pending = true;

  /** Emits one notification after both render prerequisites have completed. */
  async function ready(): Promise<void> {
    if (!resolved || leaving || !pending) return;
    pending = false;
    await notify();
  }

  return {
    start: () => { resolved = false; pending = true; },
    leave: () => { leaving = true; },
    finish: async () => { resolved = true; await ready(); },
    afterLeave: async () => { leaving = false; await ready(); },
  };
}

/** Follows rendered exact source identities through Studio's public SDK selection callback. */
export function connectFixtureStudio(host: StudioHost, environment: FixtureStudioEnvironment): void {
  if (connectedHosts.has(host)) return;
  connectedHosts.add(host);

  const editCallbacks: EditCallback[] = [];
  const routeCallbacks: RouteCallback[] = [];
  const registerEdit = host.on.requestDocumentEdit;
  const listDocuments = host.document.db.list;
  const expand = host.ui.expandSidebar;
  const navigate = host.app.navigateTo;
  let markDocumentsReady: () => void = () => {};
  const documentsReady = new Promise<void>(resolve => { markDocumentsReady = resolve; });
  let previousRoute = environment.route();
  let selecting = false;
  let requested = false;
  let completed = '';
  let preferenceRevision = 0;
  let previousSync = studioSynchronizationEnabled(environment.preferences());

  /** Serializes selection requests and drops outdated route or preference cache entries. */
  async function synchronize(): Promise<void> {
    requested = true;
    if (selecting) return;
    selecting = true;
    try {
      while (requested) {
        requested = false;
        if (!environment.open() || !studioSynchronizationEnabled(environment.preferences())) break;
        await documentsReady;
        if (!environment.open() || !studioSynchronizationEnabled(environment.preferences())) break;
        const route = environment.route().fullPath;
        const revision = preferenceRevision;
        const target = environment.targets()[0];
        if (!target) continue;
        const selection = `${route}:${target?.fsPath ?? ''}`;
        if (selection === completed) continue;
        for (const callback of editCallbacks) await callback(target?.fsPath ?? '');
        completed = revision === preferenceRevision ? selection : '';
        requested ||= environment.route().fullPath !== route;
      }
    }
    catch {
      console.warn('[Studio fixture] Select the source file manually if page synchronization failed.');
    }
    finally {
      selecting = false;
    }
  }

  host.document.utils.detectActives = environment.targets;
  host.document.db.list = async () => {
    const documents = await listDocuments();
    markDocumentsReady();
    return documents;
  };
  host.on.requestDocumentEdit = callback => {
    editCallbacks.push(callback);
    registerEdit(callback);
  };
  host.on.routeChange = callback => { routeCallbacks.push(callback); };
  host.ui.expandSidebar = () => {
    const wasOpen = environment.open();
    expand();
    if (selecting) return;
    if (!wasOpen) completed = '';
    void synchronize();
  };
  host.app.navigateTo = path => {
    // Selecting the current catalog must not navigate to its non-public shared template.
    if (selecting || path === '/catalog/detail') return;
    const locale = resolveFixtureLocale(environment.route().params.locale);
    const publicPath = path === '/' ? `/${locale}` : path.startsWith('/en') || path.startsWith('/de') ? path : `/${locale}${path}`;
    if (publicPath !== environment.route().path) navigate(publicPath);
  };
  environment.afterPage(async () => {
    const route = environment.route();
    if (route.fullPath !== previousRoute.fullPath) {
      const previous = previousRoute;
      previousRoute = route;
      for (const callback of routeCallbacks) await callback(route, previous);
    }
    await synchronize();
  });
  environment.afterPreference(async () => {
    const sync = studioSynchronizationEnabled(environment.preferences());
    if (sync === previousSync) return;
    previousSync = sync;
    preferenceRevision++;
    completed = '';
    if (sync) await synchronize();
  });
  // Login can activate Studio after the initial Nuxt page-finish event has already run.
  void documentsReady.then(async () => {
    const route = environment.route();
    for (const callback of routeCallbacks) await callback(route, route);
  }).catch(() => {
    console.warn('[Studio fixture] Initial source detection failed. Select a content file manually.');
  });
}

/** Decorates the deferred SDK factory before the separate native Studio app starts. */
export function interceptFixtureStudioFactory(scope: { useStudioHost?: UseStudioHost }, configure: (host: StudioHost) => void): void {
  const descriptor = Object.getOwnPropertyDescriptor(scope, 'useStudioHost');
  if (descriptor?.configurable === false) {
    if (scope.useStudioHost) configure(scope.useStudioHost());
    return;
  }
  let factory = scope.useStudioHost;
  Object.defineProperty(scope, 'useStudioHost', {
    configurable: true,
    enumerable: true,
    get: () => factory,
    set: (nextFactory: UseStudioHost | undefined) => {
      if (!nextFactory) { factory = undefined; return; }
      const host = nextFactory();
      configure(host);
      factory = () => host;
    },
  });
  if (factory) scope.useStudioHost = factory;
}

/** Reads only exact source markers emitted by the fixture's resolved content queries. */
export function renderedFixtureTargets(root: ParentNode): Array<{ fsPath: string, title: string }> {
  const element = root.querySelector<HTMLElement>('[data-studio-file]');
  const fsPath = element?.dataset.studioFile;
  return isFixtureContentPath(fsPath) ? [{ fsPath, title: element?.querySelector('h1')?.textContent || fsPath }] : [];
}
