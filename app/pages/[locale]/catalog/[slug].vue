<script setup lang="ts">
import { contentSourcePath, resolveFixtureLocale } from '~/utils/validators';

const route = useRoute();
const locale = resolveFixtureLocale(route.params.locale);
const slug = String(route.params.slug);
const { data, status } = await useAsyncData(`catalog:${locale}:${slug}`, async () => {
  const [layout, catalog] = await Promise.all([
    queryCollection(locale === 'de' ? 'pages_de' : 'pages_en').path('/catalog/detail').first(),
    queryCollection(locale === 'de' ? 'catalog_de' : 'catalog_en').first(),
  ]);
  return { layout, catalog };
});
const item = computed(() => data.value?.catalog?.items.find(entry => entry.slug === slug));
</script>

<template>
  <section v-if="status !== 'pending' && data?.layout && item" :data-studio-file="contentSourcePath(data.catalog?.id)">
    <!-- Baseline intentionally removes its element during Studio's background refresh. -->
    <p class="eyebrow">{{ item.kind }}</p>
    <h1>{{ item.title }}</h1>
    <p>{{ item.description }}</p>
    <ul><li v-for="feature in item.features" :key="feature">{{ feature }}</li></ul>
    <ContentRenderer :value="data.layout" />
  </section>
</template>
