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
