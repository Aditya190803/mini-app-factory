# One-click deploy to the user's Cloudflare account

**Status:** design only — future scope, nothing implemented.
**Written:** 09 Aug 2026

Goal: let a user publish a generated project to **their own** Cloudflare Pages account in one click,
and — when the project needs a backend — get server-side endpoints without leaving that deployment.

> Verify the exact endpoint shapes against current Cloudflare docs before implementing. The overall
> architecture below is sound, but request/response details drift.

---

## 1. The headline finding: no OAuth, use a scoped API token

This is the thing that shapes the whole design, so it goes first.

GitHub, Netlify, and Vercel all run public OAuth app programs — you register an app, get a
client id/secret, and users authorise with a redirect. **Cloudflare does not.** There is no
self-serve way to register a third-party OAuth application that can act on a user's Cloudflare
account.

Wrangler *does* use an OAuth flow (PKCE against `https://dash.cloudflare.com/oauth2/auth`), but with
a client id baked into the Wrangler CLI. Borrowing it would mean impersonating Cloudflare's own
first-party tool — not an option.

**So the connect flow is: the user creates a scoped API token in their dashboard and pastes it.**

That's a worse UX than the existing GitHub/Netlify buttons, and the design should own that rather
than pretend otherwise. Mitigations:

- Deep-link straight to the token-creation screen with the template pre-selected:
  `https://dash.cloudflare.com/profile/api-tokens`
- Show the exact permissions needed, copyable.
- Validate the token immediately on paste (`GET /client/v4/user/tokens/verify`) and show which
  account(s) it can reach, so a wrong-scope token fails at connect time rather than at deploy time.
- Store the account id alongside the token so the user picks their account once.

### Token permissions to request

| Permission | Scope | Needed for |
|---|---|---|
| `Cloudflare Pages: Edit` | Account | Create projects, upload deployments |
| `Workers Scripts: Edit` | Account | Only if deploying standalone Workers (see §4) |
| `D1: Edit` | Account | Only if provisioning a database |
| `Zone: DNS: Edit` | Zone | Only for custom domains on a zone they own |

Start with Pages-only. Everything else is opt-in at the point the feature is used.

---

## 2. Deployment mechanism: Pages Direct Upload

Pages supports **Direct Upload** — publishing a set of static assets with no Git repo involved.
That fits this product exactly, since projects are already plain HTML/CSS/JS held in Convex, and it
avoids the GitHub round-trip the current deploy path requires.

Rough sequence (what `wrangler pages deploy` does under the hood):

1. **Ensure a project exists**
   `POST /client/v4/accounts/{account_id}/pages/projects`
   with `{ name, production_branch: "main" }`. Treat "already exists" as success — the name is the
   subdomain, so collisions across the user's own account are expected on redeploy.

2. **Get an upload token**
   `GET /client/v4/accounts/{account_id}/pages/projects/{project_name}/upload-token`
   Returns a short-lived JWT used for the asset endpoints below.

3. **Hash the files and ask which are missing**
   `POST /client/v4/pages/assets/check-missing` with the list of content hashes.
   Cloudflare dedupes across deployments, so a redeploy that changes one page uploads one file.
   This is a genuine advantage over the current GitHub path, which PUTs every file every time.

4. **Upload the missing assets**
   `POST /client/v4/pages/assets/upload` with base64 payloads, batched.

5. **Create the deployment**
   `POST /client/v4/accounts/{account_id}/pages/projects/{project_name}/deployments`
   with the file manifest (path → hash). Response carries the deployment id and the live URL.

Result: `https://<project>.pages.dev`, with a per-deployment preview URL as well.

**Why this beats the current flow.** Today, deploying means creating a GitHub repo, PUTting each
file individually through the Contents API (two calls per file, sequential), then triggering
Vercel/Netlify. Direct Upload is one batched, deduped operation and needs no third-party account
beyond Cloudflare. It also sidesteps the timeout risk noted in the review's BUG-6, where a
medium-sized project can exceed the platform limit mid-push and leave a half-written repo.

---

## 3. Where this slots into the existing code

The deploy layer is already provider-shaped, which makes this mostly additive.

| File | Change |
|---|---|
| `lib/deploy-shared.ts` | Add `'cloudflare'` to the provider union and its display metadata |
| `lib/deploy-server.ts` | New `cloudflareRequest()` helper mirroring `githubRequest`/`netlifyRequest`; the five-step upload above |
| `convex/schema.ts` | `userIntegrations`: add `cloudflareApiToken`, `cloudflareAccountId`, `cloudflareConnectedAt` |
| `lib/integrations.ts` | Extend the encrypt/decrypt choke point — the token goes through `secret-box` like every other credential |
| `app/api/integrations/cloudflare/connect/route.ts` | **New.** Accepts a pasted token, verifies it, lists accounts, stores it encrypted |
| `app/api/deploy/route.ts` | New branch in the existing SSE flow |
| `hooks/use-editor-deploy.ts` | Cloudflare option in the provider picker |
| `components/editor/editor-deploy-dialog.tsx` | Connect-and-paste UI instead of an OAuth redirect |

Note there is no `.../cloudflare/callback/route.ts` — no OAuth, no callback. The connect route is a
plain authenticated POST.

`lib/oauth-revoke.ts` gains a Cloudflare case: `DELETE /client/v4/user/tokens/{id}` can revoke a
token the user created, if the token has permission to delete itself. More likely the honest answer
is to tell the user to delete it in their dashboard, and record that in the revoke result the way
the Vercel case already does.

---

## 4. Backend: use Pages Functions, not standalone Workers

The request mentioned Workers for backend needs. Worth separating two options, because one is
considerably better here.

### Pages Functions (recommended)

A `functions/` directory inside the Pages project **automatically becomes Workers**. A file at
`functions/api/contact.js` serves `POST /api/contact` on the same domain.

```js
// functions/api/contact.js
export async function onRequestPost({ request, env }) {
  const { email, message } = await request.json();
  await env.DB.prepare('INSERT INTO messages (email, body) VALUES (?, ?)')
    .bind(email, message)
    .run();
  return Response.json({ ok: true });
}
```

Why this is the right fit:

- **No extra deploy step.** Functions ride along in the same Direct Upload. One deployment, one
  URL, one rollback unit.
- **No CORS.** Same origin as the site, so generated frontend code can just `fetch('/api/...')`.
- **Matches the product's shape.** The generator emits a folder of files; this is one more folder.
- **Preview deployments get their own working backend** for free.

The generator's system prompt would need a section teaching it the `functions/` convention and the
`onRequest*` handler signature — a prompt change plus a validator rule, not new infrastructure.

### Standalone Workers (only if needed)

`PUT /client/v4/accounts/{account_id}/workers/scripts/{name}` with a multipart body. Warranted only
for things Pages Functions can't express — cron triggers, Durable Objects, a service consumed by
something other than this site. Skip for v1.

### Storage bindings

When a project needs persistence, provision on demand and record the binding:

- **D1** (SQLite) — `POST /client/v4/accounts/{account_id}/d1/database` for anything relational.
  The natural default.
- **KV** — key/value, for counters, feature flags, simple caches.
- **R2** — object storage, for uploads.

Bindings are declared in the Pages project's deployment configuration, so provisioning means
creating the resource and then patching the project config before the next deployment.

**Sequencing caution:** D1 means schema, and schema means migrations. That is a materially larger
product surface than static hosting — it is where Lovable and Emergent spend most of their
engineering. Ship Pages Functions with *no* storage first (contact forms, webhook receivers, API
proxies with secrets); add D1 only if the demand is real.

---

## 5. Things Cloudflare gives you cheaply once connected

- **Custom domains** — `POST /accounts/{aid}/pages/projects/{proj}/domains`. If the zone is already
  on the user's Cloudflare account, DNS and SSL are automatic. This is a notably better experience
  than the Netlify/Vercel paths, which need manual DNS.
- **Rollback** — Pages retains deployment history; promoting a previous deployment to production is
  an API call. This directly answers a gap the review flagged (no published-version rollback), and
  it's a gap **Lovable also has**.
- **Preview URLs per deployment** — a staging/production split, which Lovable does not offer for
  the app itself.
- **Free tier is genuinely generous** — unlimited bandwidth/requests for static assets, and a large
  daily Functions request allowance. For static marketing sites, most users will never pay.

---

## 6. Suggested phasing

**Phase 1 — static deploy.** Token connect + verify, Direct Upload, live `.pages.dev` URL,
redeploy. Everything in §1–§3. This is the whole win for the majority of projects and is
self-contained.

**Phase 2 — custom domains and rollback.** Both are small API calls on top of Phase 1 and both close
real gaps against competitors.

**Phase 3 — Pages Functions.** Prompt work so the generator can emit `functions/`, a validator rule,
and secrets management (Pages project env vars, encrypted via the existing `secret-box`). No new
deploy machinery.

**Phase 4 — D1, only if warranted.** Provisioning, schema generation, migrations. Treat as a
separate product decision, not a follow-on task.

---

## 7. Open questions to resolve before building

1. Does `check-missing`/`upload` accept the account-scoped API token directly, or is the
   `upload-token` JWT mandatory? Affects how many round-trips the deploy needs.
2. Batch-size and payload limits on `pages/assets/upload` — determines chunking for large projects.
3. Whether a user-created API token can delete itself (`DELETE /user/tokens/{id}`), which decides
   whether disconnect can genuinely revoke or only forget.
4. Project-name collision policy: reuse the existing project on redeploy, or suffix? Reuse is
   almost certainly right, but confirm the redeploy semantics on an existing project.
5. Whether to keep the GitHub repo step as an *option* alongside Cloudflare, since some users want
   the repo as much as the hosting.
