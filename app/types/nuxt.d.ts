import type { FixturePageLifecycle } from '../utils/studio-page-context';

declare module '#app' {
  interface NuxtApp {
    $fixturePageLifecycle: FixturePageLifecycle
  }
}

declare module 'vue' {
  interface ComponentCustomProperties {
    $fixturePageLifecycle: FixturePageLifecycle
  }
}

export {};
