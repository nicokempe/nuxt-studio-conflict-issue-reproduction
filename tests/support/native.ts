import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { expectedFixed } from './mode';

/** Absolute installed package path, shared by both branches. */
export const studioPackageRoot: string = fileURLToPath(new URL('../../node_modules/nuxt-studio/', import.meta.url));

interface CompatibilityModule {
  patchStudioAppBundle: (source: string, version: string) => string;
}

/** Uses the untouched installed bundle on main and its actual build transform on the fixes branch. */
export async function loadNativeBundles(): Promise<{ original: string; selected: string }> {
  const original = await readFile(new URL('../../node_modules/nuxt-studio/dist/app/main.js', import.meta.url), 'utf8');
  if (!expectedFixed) return { original, selected: original };
  const helperUrl = new URL('../../node_modules/nuxt-studio/dist/module/runtime/utils/studio-app.mjs', import.meta.url);
  const compatibility = await import(helperUrl.href) as CompatibilityModule;
  return { original, selected: compatibility.patchStudioAppBundle(original, '1.8.0') };
}

/** Extracts a pinned complete declaration; dependency source drift must fail visibly. */
export function declaration(bundle: string, startMarker: string, endMarker: string): string {
  const start = bundle.indexOf(startMarker);
  const end = bundle.indexOf(endMarker, start + startMarker.length);
  assert.ok(start >= 0 && end > start, `Locate the shipped declaration ${startMarker}.`);
  return bundle.slice(start, end);
}

/** Checks named DOM exceptions without depending on a VM's Error constructor. */
export function hasErrorName(error: unknown, name: string): boolean {
  return typeof error === 'object' && error !== null && 'name' in error && error.name === name;
}
