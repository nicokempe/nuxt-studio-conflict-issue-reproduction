# Testing the production Studio host

The automated reproductions and `bun run dev` need no credentials. Use this guide only to test the actual production editing host.

## Configure your own GitHub OAuth App

1. In GitHub developer settings, create an **OAuth App**. This is separate from a GitHub App installation.
2. Use the site origin as the homepage URL. For a local preview, use `http://localhost:3000` and start the preview on that port.
3. Set **Authorization callback URL**, sometimes labelled **Redirect URI**, to `http://localhost:3000/__nuxt_studio/auth/github`. Replace the origin for an HTTPS deployment. The callback is not `/_studio`.
4. Copy `.env.example` to `.env`. Enter your own client ID and client secret.
5. Generate a session secret locally with `openssl rand -base64 32` and put it in `NUXT_STUDIO_AUTH_SESSION_SECRET`.
6. Set `NUXT_STUDIO_AUTH_GITHUB_MODERATORS` to the verified GitHub email addresses you intend to allow. Keep access restricted while testing.
7. Set `STUDIO_REPOSITORY_BRANCH=main` or `fixes`, matching the branch being tested. On a deployed host, supply this when building as well as any runtime credentials.

Keep `.env` untracked. OAuth client secrets and session secrets are confidential; the OAuth client ID is an identifier. Do not use credentials from another website.

## Build and open

```bash
bun install --frozen-lockfile
bun run build
bun run preview --port 3000
```

Nuxt preview loads `.env` locally. A real deployment must supply the runtime variables through its own environment or secret store. Open `http://localhost:3000/_studio`, complete GitHub login, and use **Edit this page**.

The initial public-page redirect after sign-in is expected. Studio activates on the website rather than remaining at a separate editor URL.

## Check the behavior

1. Enable editor/preview synchronization.
2. Open the homepage editor and navigate to a product, partner, article and another language.
3. On `fixes`, confirm that the selected source file follows the current route and the public URL remains intact. Catalog pages should select their localized YAML catalog, rather than the shared layout.
4. Use **Refresh content** while a catalog page is open. Compare the baseline's disappearing pending root with the fixed stable root.
5. Open the article without editing it. Check whether table alignment alone produces a changed draft.
6. If testing publication, review the full file diff and explicitly approve only the intended changes. GitHub write access is required. The automated tests do not publish.

For storage failures, prefer the isolated tests. They create their own IndexedDB factories and leave real browser drafts alone. Do not clear a browser's site data as a general recovery step, since it may contain unpublished work.

## Cloudflare configuration notes

Cloudflare is not required to run this project. The original runtime also exposed a deployment configuration issue: Wrangler could remove dashboard plaintext variables while retaining secrets. A missing client ID then made Studio appear unavailable.

If using dashboard-managed variables, configure Wrangler to preserve them (`keep_vars` / `--keep-vars`) or manage the complete intended variable set in version control. Do not mix these approaches accidentally. Preservation cannot restore a value already removed.

The candidate Studio patch returns a static, non-cacheable unavailable response when no provider is configured and sanitizes authentication errors. It does not configure an OAuth provider on your behalf.

Studio 1.8 checks moderator access at sign-in. Removing an address does not by itself revoke an existing session, and the stored GitHub token is not automatically refreshed. Keep those version-specific limits in mind when testing access removal.
