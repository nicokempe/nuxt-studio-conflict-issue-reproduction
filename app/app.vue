<script setup lang="ts">
import { resolveFixtureLocale } from '~/utils/validators';

const route = useRoute();
const nuxtApp = useNuxtApp();
const locale = computed(() => resolveFixtureLocale(route.params.locale));

/** Repeats the background refresh that production Studio requests while editing. */
async function refreshPreview(): Promise<void> {
  await refreshNuxtData();
}

/** Tracks an actual outgoing leave, rather than every asynchronous render cycle. */
function beforePageLeave(): void {
  if (import.meta.client) nuxtApp.$fixturePageLifecycle.leave();
}

/** Releases a cancelled outgoing transition as well as a completed one. */
async function cancelledPageLeave(): Promise<void> {
  if (import.meta.client) await nuxtApp.$fixturePageLifecycle.afterLeave();
}
</script>

<template>
  <div class="shell">
    <header>
      <NuxtLink :to="`/${locale}`" class="brand">Example Catalog</NuxtLink>
      <nav aria-label="Example pages">
        <NuxtLink :to="`/${locale}`">Home</NuxtLink>
        <NuxtLink :to="`/${locale}/catalog/example-product`">Product</NuxtLink>
        <NuxtLink :to="`/${locale}/catalog/example-partner`">Partner</NuxtLink>
        <NuxtLink :to="`/${locale}/article`">Article</NuxtLink>
        <NuxtLink :to="locale === 'en' ? '/de' : '/en'">{{ locale === 'en' ? 'Deutsch' : 'English' }}</NuxtLink>
      </nav>
      <button type="button" @click="refreshPreview">Refresh content</button>
    </header>
    <main>
      <NuxtPage
        :page-key="pageRoute => pageRoute.path"
        :transition="{ name: 'fade', mode: 'out-in', onBeforeLeave: beforePageLeave, onLeaveCancelled: cancelledPageLeave }"
      >
        <template #default="{ Component }">
          <div><component :is="Component" /></div>
        </template>
      </NuxtPage>
    </main>
    <footer>
      <p>Anonymous Studio reproduction. Every name and content entry is synthetic.</p>
      <a href="/_studio">Open Studio</a>
    </footer>
  </div>
</template>

<style>
:root { font-family: system-ui, sans-serif; color: #1c2530; background: #f7f8fa; }
body { margin: 0; }
* { box-sizing: border-box; }
a { color: #2054a5; text-underline-offset: .2em; }
button, a { -webkit-tap-highlight-color: transparent; }
button { cursor: pointer; padding: .65rem .9rem; border: 1px solid #bac4d0; border-radius: .4rem; background: white; color: inherit; font: inherit; }
button:hover { background: #edf3fc; }
.shell { max-width: 66rem; padding: 0 1.5rem; margin: auto; }
header { display: flex; flex-wrap: wrap; align-items: center; gap: 1rem 2rem; padding: 1.5rem 0; border-bottom: 1px solid #d8dfe8; }
.brand { font-weight: 700; color: #1c2530; text-decoration: none; }
nav { display: flex; flex-wrap: wrap; gap: 1rem; flex: 1; }
main { min-height: 28rem; padding: 2.5rem 0; }
main h1 { margin-top: 0; font-size: clamp(2rem, 5vw, 3rem); letter-spacing: -.025em; }
main p, main li { line-height: 1.7; }
main h2 { margin-top: 2rem; }
main pre { background: #e9edf2; border-radius: .5rem; padding: 1rem; overflow-x: auto; }
main table { border-collapse: collapse; width: 100%; }
main th, main td { border: 1px solid #cbd4df; padding: .65rem; }
.eyebrow { color: #526276; font-size: .85rem; text-transform: uppercase; letter-spacing: .07em; }
.panel { margin: 2rem 0; padding: 1.5rem; background: white; border: 1px solid #d8dfe8; border-radius: .65rem; }
.actions { display: flex; flex-wrap: wrap; gap: 1rem; margin-top: 1rem; }
footer { display: flex; flex-wrap: wrap; justify-content: space-between; gap: 1rem; padding: 1rem 0 2rem; border-top: 1px solid #d8dfe8; font-size: .9rem; color: #526276; }
footer p { margin: 0; }
.fade-enter-active, .fade-leave-active { transition: opacity .18s ease; }
.fade-enter-from, .fade-leave-to { opacity: 0; }
</style>
