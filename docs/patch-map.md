# Candidate patch map

This branch applies three Bun package patches to exact package versions. The unpatched branch is the failure control. These are compatibility workarounds against the published distributions, not proposed source-level upstream commits.

No original application source, content, browser recordings, account identifiers or production configuration is included. Fixtures use invented content.

## Studio 1.8.0

File: `patches/nuxt-studio@1.8.0.patch`.

| Area | Distribution files | Purpose |
| --- | --- | --- |
| Conflict comparison | `document/compare.js` | Parse remote Markdown with the same MDC grammar as Content 3, then use Studio's normal sanitization. Preserve real text, code, link and property differences. |
| Source serialization | `document/generate.js`, `document/schema.js`, `document/tree.js` | Preserve typed component properties and hidden authored metadata instead of discarding them during publication. |
| Authentication errors | Server admin/auth routes and `server/utils/auth.js` | Return fixed, non-cacheable error responses without embedding configuration or provider response data. A missing provider produces a static 503 response. |
| Preview worker | `dist/app/service-worker.js` | Open the current IndexedDB schema, add a missing `drafts` store without deleting records, and close every media-read connection. |
| Worker readiness | `dist/module/runtime/host.js` | Register worker `v0.0.6` without the HTTP cache and wait for the intended activation and takeover before continuing. Include bounded waits and the valid activated-worker/null-controller case. |
| Asset integration | `dist/module/module.mjs`, `utils/studio-app.mjs` | Copy and transform the native app into content-fingerprinted assets. Recreate them after Nuxt CLI cleanup, without rewriting the package's original `main.js`. |

The production native-app replacements are separated by concern:

| Module under `dist/module/runtime/utils/` | Changes |
| --- | --- |
| `studio-app-editing.mjs` | Register exact-file edit requests in production; show the Comark notice only for Markdown. Development filesystem watchers remain development-only. |
| `studio-app-tables.mjs` | Preserve table-cell properties through the native converters and TipTap schema. Keep the preservation bag out of rendered editor HTML. |
| `studio-app-selection.mjs` | Reject stale selection completions, share concurrent loads of one file, invalidate cancellation and prevent stale file-tree navigation. |
| `studio-app-reconciliation.mjs` | Rebase a restored draft only when its complete generated UTF-8 source equals fresh GitHub source and a lossless detached baseline is safe. Preserve real changes, conflicts and failed checks. |
| `studio-app-storage.mjs` | Repair incomplete native draft schemas in place, release connections on version changes and wait for updated worker readiness before draft reads. |

`studio-app.mjs` checks the version and every expected native source marker before applying any replacement. A changed upstream bundle fails the build with the mismatched boundary. The transforms are intentionally pinned to 1.8.0. They are not a general patching framework and should not be carried forward silently after an upgrade.

The added modules stay in the existing package directory because Bun 1.4.3 cannot reliably apply this patch when they introduce a new nested directory. Splitting the old helper into these modules does not change the transformed app bytes. The replacements retain their original order and literal helper source so Node and Bun produce the same output.

## Comark 0.7.0

File: `patches/comark@0.7.0.patch`.

- Preserve case-sensitive named slots while retaining component-name normalization.
- Keep string values such as `"true"`, `"false"` and `"3"` distinct from typed values.
- Preserve arbitrary CSS class contents rather than using lossy dot shorthand.
- Preserve table alignment and explicit hard breaks.
- Avoid an empty YAML attribute block when a component has no properties.

This patch changes the installed host-side Comark package. It does not replace the optional AI-completion parser embedded inside Studio's prebuilt application. That separate path is outside this reproduction's verified coverage.

## Content 3.16.2

File: `patches/@nuxt%2Fcontent@3.16.2.patch`.

- Preserve an authored string excerpt, using the generated excerpt only as the fallback.
- Generate Studio collection metadata during `nuxt prepare` so formatting checks work before the first development/build session.
- Apply the same behavior to the ESM and CommonJS distributions.

## Application integration remains separate

Some observed behavior needs application integration rather than a package patch: locale-to-file mapping, selecting catalog data instead of a shared layout, retaining resolved content during refresh, tracking actual Vue leave events, and respecting Studio's synchronization preference. The fixed application illustrates those decisions separately from the package changes.

Cloudflare dashboard-variable retention is an operational deployment concern. It does not belong in a generic Studio parser or editor patch. Likewise, unsupported browser features and challenge-frame console messages are not included as reproduced Studio defects.

## Upstreaming and verification limits

The native transforms operate on minified 1.8.0 boundaries because the npm package ships a prebuilt editor. For upstream work, port each change to its corresponding source module and test it independently. Do not submit the bundled transform as a replacement for a source-level fix.

Local native-function tests can prove the reported races, conversion loss and shared-storage lock, but controlled SDK/browser boundaries do not prove a real OAuth login, real GitHub publication or every browser's service-worker lifecycle. Use the manual production-host scenarios for those checks. Database recovery must preserve unpublished work; deleting all browser storage is not a general fix.
