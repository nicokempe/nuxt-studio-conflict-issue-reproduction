import { defineCollection, defineContentConfig, z } from '@nuxt/content';

/** Defines translated page content whose public URL has a separate locale prefix. */
function pages(locale: 'en' | 'de') {
  return defineCollection({
    type: 'page',
    source: {
      include: `locales/${locale}/**/*.md`,
      prefix: '',
    },
    schema: z.object({
      slug: z.string().optional().editor({ hidden: true }),
      excerpt: z.string().optional(),
    }),
  });
}

/** Defines a translated product and partner catalog with one shared page layout. */
function catalog(locale: 'en' | 'de') {
  return defineCollection({
    type: 'data',
    source: `locales/${locale}/globals/catalog.yml`,
    schema: z.object({
      items: z.array(z.object({
        slug: z.string(),
        kind: z.enum(['product', 'partner']),
        title: z.string(),
        description: z.string(),
        features: z.array(z.string()),
      })),
    }),
  });
}

export default defineContentConfig({
  collections: {
    pages_en: pages('en'),
    pages_de: pages('de'),
    catalog_en: catalog('en'),
    catalog_de: catalog('de'),
  },
});
