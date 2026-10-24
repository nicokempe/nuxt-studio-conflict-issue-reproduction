export default defineNuxtConfig({
  compatibilityDate: '2026-10-24',
  modules: ['@nuxt/content', 'nuxt-studio', '@nuxt/eslint'],
  devtools: { enabled: false },
  typescript: { strict: true },
  content: { experimental: { sqliteConnector: 'native' } },
  app: { pageTransition: { name: 'fade', mode: 'out-in' } },
  studio: {
    repository: {
      provider: 'github',
      owner: 'nicokempe',
      repo: 'nuxt-studio-conflict-issue-reproduction',
      branch: process.env.STUDIO_REPOSITORY_BRANCH || 'main',
      private: false,
    },
  },
});
