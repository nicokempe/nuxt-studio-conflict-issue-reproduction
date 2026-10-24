<script setup lang="ts">
import { contentSourcePath, resolveFixtureLocale } from '~/utils/validators';

const route = useRoute();
const locale = resolveFixtureLocale(route.params.locale);
const { data: page } = await useAsyncData(`article:${locale}`, () => queryCollection(locale === 'de' ? 'pages_de' : 'pages_en').path('/article').first());
</script>

<template>
  <article v-if="page" :data-studio-file="contentSourcePath(page.id)">
    <h1>{{ page.title }}</h1>
    <ContentRenderer :value="page" />
  </article>
  <p v-else>Article content unavailable.</p>
</template>
