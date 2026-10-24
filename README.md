# Nuxt Studio 1.8 reproduction

A small, synthetic Nuxt site and executable reproductions for content conflicts, serialization changes, production editor selection and browser draft storage. It uses the published packages involved in the reported behavior, rather than copying the application that exposed it.

## Compare the two branches

| Branch | Purpose | What a passing test means |
| --- | --- | --- |
| [`main`](https://github.com/nicokempe/nuxt-studio-conflict-issue-reproduction/tree/main) | Unmodified upstream packages and the original integration behavior | The reported defect was reproduced. Assertions deliberately check the broken result. |
| [`fixes`](https://github.com/nicokempe/nuxt-studio-conflict-issue-reproduction/tree/fixes) | The same fixtures and tests, with candidate dependency patches and a page-context adapter | The corresponding repaired behavior was verified. |

Use the [branch comparison](https://github.com/nicokempe/nuxt-studio-conflict-issue-reproduction/compare/main...fixes) to review the changes. `main` should remain unpatched so it stays useful as a failure control. The tests print the mode they detect from `package.json`; setting an environment flag cannot silently turn a patched installation into the upstream control.

## Run the reproductions

Requires Node **24.22.1** and Bun **1.4.3**. Package versions and lockfiles are pinned intentionally. This is a report about these releases, not a recommendation to use an older version.

```bash
git clone https://github.com/nicokempe/nuxt-studio-conflict-issue-reproduction.git
cd nuxt-studio-conflict-issue-reproduction
bun install --frozen-lockfile
bun run test
```

The tests need no credentials, Cloudflare account, GitHub API writes or browser login. They exercise the installed parsers, serializers and selected functions from Studio's published application. Browser, provider and Nuxt boundaries are controlled where needed. These are package-level reproductions, not a claim that every browser session has the same state.

Then compare the fixed branch:

```bash
git switch fixes
bun install --frozen-lockfile
bun run test
bun run typecheck
bun run lint
bun run build
```

Always install after switching branches. Bun applies the three versioned dependency patches only on `fixes`. CI runs the checks and a production build on both branches.

## What is reproduced

| Case | Observed behavior | Reproduction | Candidate repair |
| --- | --- | --- | --- |
| Content comparison | Unchanged component Markdown can conflict with its Content database representation. Some literal code differences can also be missed. | [`conflicts.ts`](tests/content/conflicts.ts) | Compare the source through Content's MDC grammar and the same database sanitization. Preserve literal code. |
| Serialization | Parsing and publishing can rename case-sensitive slots, change property types or remove authored metadata. | [`serialization.ts`](tests/content/serialization.ts) | Preserve slot spelling, typed values and hidden metadata through the native serializer. |
| Authored excerpts | Content's Markdown transformer can replace a frontmatter excerpt with generated content. | [`excerpts.ts`](tests/content/excerpts.ts) | Keep authored string excerpts, retaining the normal fallback otherwise. |
| Table editing | A no-edit pass through the rich editor can remove alignment and make a draft appear changed. | [`table.ts`](tests/native/table.ts) | Preserve properties through both native converters and the actual TipTap schema. |
| Production edit requests | The exact-file edit callback is registered in development but absent in production. | [`production-edit.ts`](tests/native/production-edit.ts) | Register that callback in both modes without enabling production filesystem watchers. |
| Page following | Localized and shared-template routes do not automatically identify their editable files. | [`page-context.ts`](tests/native/page-context.ts) | Exact source markers and an adapter respecting real transitions and Studio preferences. This is an integration feature. |
| Selection ordering | An older asynchronous file request can replace a newer selection; simultaneous loads can create duplicate drafts. | [`selection.ts`](tests/native/selection.ts) | Guard completion order, invalidate cancelled selections and share a same-file load. |
| Restored draft state | An already-published, byte-identical local draft can still count as changed. | [`reconciliation.ts`](tests/native/reconciliation.ts) | Rebase only after an exact fresh-source match, preserving conflicts and overlapping edits. |
| Authentication errors | Public errors can reflect configuration or provider diagnostics. | [`auth-errors.ts`](tests/native/auth-errors.ts) | Return fixed, non-cacheable errors without raw diagnostic data. Tests use synthetic values only. |
| Draft database schema | Opening an existing database without the required `drafts` store fails during startup. | [`storage.ts`](tests/native/storage.ts) | Repair the schema in place, close obsolete connections and bound blocked opens. |
| Media worker | Its fixed version-1 opener fails on an upgraded database, and reads can retain connections. | [`worker.ts`](tests/native/worker.ts) | Open the latest schema and close read connections on every completion path. |
| Startup ordering | Native draft initialization races service-worker registration. | [`bootstrap.ts`](tests/native/bootstrap.ts) | Await activation of the intended updated worker before reading draft storage. |

Expected results and the limits of each check are described in [the case notes](docs/cases.md). The fixed branch's [patch map](https://github.com/nicokempe/nuxt-studio-conflict-issue-reproduction/blob/fixes/docs/patch-map.md) maps the repairs to the installed package files.

## Try the site

```bash
bun run dev
```

Open the URL printed by Nuxt, then visit `/en`, `/de`, a catalog item and the article. Development Studio needs no GitHub credentials. The app includes:

- Two language prefixes with Content paths that do not contain those prefixes.
- Product and partner routes backed by localized YAML catalogs and a shared Markdown layout.
- Components with typed properties and case-sensitive named slots.
- An article containing aligned tables and literal code.
- A **Refresh content** button that requests the background data refresh used during production editing.

The fixture is intentionally small. Every name, sentence, address and catalog entry is fictional.

### Production-only behavior

Development alone does not reproduce every reported problem. The edit callback and background refresh behavior differ between the development host and the packaged production host.

For a real signed-in session, follow [the production setup](docs/production-setup.md), build, and run `bun run preview`. There is no fake authentication route. Do not publish through Studio unless you intend to change this reproduction repository.

### Following the current page

Enable Studio's **sync editor and preview** setting, open a page, and navigate using the site's links. Try Home → Product → Partner → Article → another language.

On `main`, the localized public routes and shared catalog templates are deliberately not adapted to exact source files. On `fixes`, the page-context adapter supplies the current Markdown or localized catalog file and waits for an actual outgoing transition to finish. It respects a disabled synchronization preference and does not open a closed sidebar.

This is partly an integration question, not a claim that upstream promises arbitrary URL-to-file mapping. The missing production callback and selection race are separate reproducible defects. We would welcome guidance on an official production API for this mapping so the adapter can be reduced or removed.

## Formatting is not the same as a conflict

**Comark formatting available** is Studio's upstream notice. Equivalent Markdown can legitimately need canonical formatting. **Apply** updates the local draft; publishing happens separately.

The problem reported here is the combination of false comparison results and lossy round trips. The candidate fixes retain genuine edits and genuine conflicts. They do not accept either side automatically or suppress change detection.

The fixtures under `fixtures/` intentionally contain noncanonical syntax. They must remain as failure controls. The fixes branch includes `bun run content:check` and `bun run content:format` for its six application Markdown files, separately from these fixtures. The formatter uses generated collection metadata and rejects semantic changes or an unstable second pass. Its supported SQL field types are deliberately limited to this fixture schema.

## Implementation and limits

- The fixed branch uses Bun patches for Studio **1.8.0**, Comark **0.7.0** and Content **3.16.2**.
- Studio publishes its browser application as a prebuilt bundle. The workaround transforms pinned, uniquely checked source boundaries into generated assets. It does not vendor a replacement minified application or silently accept a changed upstream version.
- The cleaned transform is split into editing, table, selection, reconciliation and storage modules. New editor bytes receive a content-derived URL; the build recreates them after Nuxt CLI cleanup.
- These distribution-level workarounds are evidence for upstream fixes, not proposed source-level pull requests. Maintainers can move each change to its owning source module.
- Missing-store fixtures deliberately seed an incomplete database. The original cause of such a database in an affected browser was not established. The service-worker lock and higher-version failures are separately reproduced.
- Browser draft records are preserved. The fixes do not delete a database to make startup pass.
- A later manual production session completed both draft loads. That observation does not establish publication or form-submission correctness.
- Cloudflare challenge warnings and Firefox WASM source-map warnings are outside this reproduction. No raw browser captures, credentials or production identifiers are included.

## Verification

Both branches have been checked with all 12 reproduction scripts, strict app and standalone-test typechecking, ESLint and a complete production build. HTTP checks against each built server returned 200 for all eight demo routes and verified that the emitted native Studio application is served byte-for-byte.

With no OAuth provider configured, the baseline returns 404 at `/_studio`; the candidate patch returns a static 503 with `Cache-Control: no-store`. Neither is a successful sign-in test. Authenticated browser editing and publication from this public fixture have not been performed.

See [the case notes](docs/cases.md) for expected results, the limitations of the tests and approaches that were insufficient.
