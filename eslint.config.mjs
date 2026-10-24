import withNuxt from './.nuxt/eslint.config.mjs';

export default withNuxt(
  { ignores: ['patches/**', 'fixtures/**'] },
  {
    files: ['**/*.ts', '**/*.vue'],
    rules: { '@typescript-eslint/no-explicit-any': 'error' },
  },
);
