/** Accepts the two public locale prefixes used by this fixture. */
export function resolveFixtureLocale(value: unknown): 'en' | 'de' {
  return value === 'de' ? 'de' : 'en';
}

/** Converts a standard Content collection ID into its source-relative file identity. */
export function contentSourcePath(identifier: string | undefined): string {
  if (!identifier) return '';
  const separator = identifier.indexOf('/');
  if (separator < 0) return '';
  const collection = identifier.slice(0, separator);
  const relativePath = identifier.slice(separator + 1);
  const filename = collection === 'pages_en' ? `locales/en/${relativePath}`
    : collection === 'pages_de' ? `locales/de/${relativePath}` : relativePath;
  return filename.startsWith('locales/') && !filename.split('/').includes('..') ? filename : '';
}

/** Accepts exact synthetic content paths without traversal or URL fragments. */
export function isFixtureContentPath(value: unknown): value is string {
  return typeof value === 'string'
    && (value.startsWith('locales/en/') || value.startsWith('locales/de/'))
    && !value.includes('\\') && !value.includes('?') && !value.includes('#')
    && value.split('/').every(segment => segment !== '' && segment !== '.' && segment !== '..')
    && ['.md', '.yml'].some(extension => value.endsWith(extension));
}

/** Respects Studio's explicit synchronization setting and its enabled default. */
export function studioSynchronizationEnabled(value: unknown): boolean {
  return value === null || typeof value !== 'object' || !('syncEditorAndRoute' in value) || value.syncEditorAndRoute !== false;
}
