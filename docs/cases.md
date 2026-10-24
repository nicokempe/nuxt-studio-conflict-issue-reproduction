# Case notes

## Evidence levels

The tests are small executable assertions around published package code. On `main` they establish the original behavior. On `fixes` they establish the candidate repaired behavior with the same fixtures. A green baseline run means the defect was reproduced, not that upstream behaved correctly.

Network, UI and Nuxt boundaries are controlled where needed. The tests do not replay a real authentication session, contact GitHub as an editor or publish content. Browser lifecycle events and IndexedDB use controlled implementations. A full browser/navigation check remains useful after any upstream change.

## Comparison, canonical formatting and changed drafts

These are three different mechanisms:

1. **Conflict comparison:** Content stores MDC/minimark while Studio parses a GitHub file through Comark. Comparing those representations can report a conflict on unchanged content. The repair uses the same grammar for both sides and retains code whitespace.
2. **Canonical formatting:** Studio's native serializer can generate different raw Markdown for equivalent input. This notice is expected where the source is noncanonical. The fixtures retain such input intentionally.
3. **Draft status:** Opening the rich editor can itself lose table properties. Separately, a restored draft can retain an accepted-formatting/update flag after the exact same source has reached GitHub.

The serializer fixes preserve case-sensitive slots, booleans versus strings, numbers versus strings, nested data, classes, line breaks, aligned tables and hidden authored metadata. Intentional changes must remain detectable. Authored excerpt preservation belongs to Content's transformer rather than the conflict comparator.

Restored-draft cleanup must be conservative: a fresh GitHub response must match the complete serialized UTF-8 source, no conflict may exist, and the detached baseline must retain every property. Concurrent mutations cancel the cleanup. A failed request or a real raw-source difference leaves the draft pending.

## Exact-file editing and navigation

A URL is not necessarily a Content document path. A localized catalog item can render a shared Markdown template while its editable text lives in a YAML catalog.

The example app makes this explicit. A small `data-studio-file` marker identifies the rendered page's actual source. The fixed adapter requests that file only after rendering and any real outgoing transition finish. It follows the existing sync preference, including changes to it, and preserves manual editing when sync is disabled.

Three additional upstream details matter:

- Studio's pinned native initializer registers the exact-file editing callback only in development.
- A pending selection can finish after a newer selection and replace it.
- Concurrent loads of the same file can each create a draft.

The package patch corrects those details. The app adapter handles the routing convention. Neither should be mistaken for the other.

The earlier approach treated every page-start event as an outgoing leave. Nuxt also completes render cycles without a leave, so that assumption could wait forever. The fixed app tracks Vue's actual leave callback and releases on transition completion or cancellation.

## Background refresh and stable roots

Production Studio can request `app:data:refresh` while editing. The baseline catalog page removes its main root during pending data. The fixed page retains resolved content and a permanent root during refresh.

This reproduces the dangerous rendering condition. It does not promise the exact same Vue `_leaveCb` exception in every browser: that exception depends on renderer state and timing. Development-host checks alone missed the production refresh path.

## Draft storage and the media worker

There are two databases, `studio-v1-document` and `studio-v1-media`, both requiring a `drafts` object store.

The original native helper creates its store only in an upgrade callback. An existing incomplete database can therefore open successfully and fail when its first transaction starts. The repair adds the missing store in place rather than deleting the database.

The service worker is a second owner of the media database. Its original reader opens version 1 and leaves read connections open. That causes two independent problems:

- Opening version 1 fails after the native app has upgraded the database.
- A retained connection can block the app's schema upgrade, including after transaction creation throws for a missing store.

The worker now opens the latest schema, repairs a missing store and closes every read connection. The application waits for the updated worker to activate before opening draft storage. Registration, activation and takeover have a deadline, and a hard refresh with a null controller is handled explicitly.

The tests seed incomplete schemas and controlled connection states. They prove the failure and preservation properties without claiming to know what originally produced an incomplete browser database.

## Authentication and deployment

A missing runtime OAuth client ID prevented provider detection. A Nuxt-rendered 404 could then be localized, making the failure look like an `/_studio` routing problem. Runtime configuration retention and a static unavailable response address different parts of that sequence.

The public authentication handlers also included raw error data in some failures. The candidate patch sanitizes error responses with synthetic test values only. No real credentials are included here.

A completed CI build, Worker publication and successful post-deployment readiness probe are distinct events. A readiness probe can fail after a Worker has already been published. A red workflow therefore does not, by itself, prove the old code is still running.

## Asset generation

One investigation found an immutable JavaScript URL whose bytes changed only in its CSS dependency references between builds. Disabling Nuxt's stable entry import map made dependency changes participate in the tested asset names. The fixed app retains that setting; this repository does not claim a separate exhaustive reproduction of the upstream cache issue.

Patched embedded Studio assets also need their own content-derived URL. Preparing them only during module setup was insufficient because Nuxt CLI subsequently removed the build directory. The candidate patch recreates and verifies them on `build:before`.

## Approaches that were insufficient

| Approach | Missing part |
| --- | --- |
| Fix parser comparison only | Canonical formatting and draft state are separate. |
| Apply native formatting immediately | Lossy slot, property, metadata and editor conversions first needed repairs. |
| Map public routes only | Production edit registration and selection ordering still failed. |
| Test development Studio only | Production refresh and callback behavior differ. |
| Generate patched assets at module setup | CLI cleanup could remove them before Nitro copied them. |
| Repair the native IndexedDB helper only | The shared media service worker retained incompatible connections. |
| Clear browser caches | It neither repairs the code nor preserves unpublished drafts. |

## Guidance requested

- What production API should an application use to select an exact source file for a localized/shared-template route?
- Should Content 3 comparison consistently use the Content parser while the editor uses Comark?
- Where should serialization and table-property preservation be guaranteed?
- Can native draft storage and the media worker share one version-aware storage implementation and startup contract?

The branch is organized as a working reference, not a request to merge one large distribution patch upstream. Each independently reproduced defect can become a focused source-level change.
