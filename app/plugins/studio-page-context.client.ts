import { connectFixtureStudio, createFixturePageLifecycle, interceptFixtureStudioFactory, renderedFixtureTargets } from '~/utils/studio-page-context';
import type { UseStudioHost } from 'nuxt-studio/app';

export default defineNuxtPlugin({
  name: 'fixture-studio-page-context',
  enforce: 'pre',
  setup(nuxtApp) {
    const router = useRouter();
    const pageCallbacks = new Set<() => Promise<void>>();
    const preferenceCallbacks = new Set<() => Promise<void>>();
    const lifecycle = createFixturePageLifecycle(async () => {
      for (const callback of pageCallbacks) await callback();
    });
    nuxtApp.hook('page:start', lifecycle.start);
    nuxtApp.hook('page:finish', lifecycle.finish);
    nuxtApp.hook('page:transition:finish', lifecycle.afterLeave);
    window.addEventListener('storage', event => {
      if (event.key !== 'studio-preferences' || event.storageArea !== window.localStorage) return;
      for (const callback of preferenceCallbacks) void callback();
    });
    interceptFixtureStudioFactory(window as Window & { useStudioHost?: UseStudioHost }, host => connectFixtureStudio(host, {
      route: () => router.currentRoute.value,
      targets: () => nuxtApp.payload.error ? [] : renderedFixtureTargets(document),
      open: () => document.body.hasAttribute('data-expand-sidebar'),
      preferences: () => {
        try {
          const source = window.localStorage.getItem('studio-preferences');
          return source ? JSON.parse(source) as unknown : undefined;
        }
        catch { return undefined; }
      },
      afterPage: callback => { pageCallbacks.add(callback); },
      afterPreference: callback => { preferenceCallbacks.add(callback); },
    }));
    return { provide: { fixturePageLifecycle: lifecycle } };
  },
});
