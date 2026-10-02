# What this needs from you

Everything builds, typechecks, lints, and passes its tests already. This file is the list of things **only you can do**, because they need
accounts, dashboards, or decisions that are yours.

Ordered by whether the app works without them.

---

## 1. Blocking. The app does not run without these.

These already existed before the redesign. Listed so the list is complete.

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `bun convex dev`, or the Convex dashboard |
| `CONVEX_DEPLOY_KEY` | Convex dashboard, Settings, Deploy keys. Also add it as a GitHub Actions secret: CI checks codegen drift and deploys Convex on merge to main. |
| `NEXT_PUBLIC_STACK_PROJECT_ID` | Stack Auth dashboard |
| `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` | Stack Auth dashboard |
| `STACK_SECRET_SERVER_KEY` | Stack Auth dashboard |
| `OPENCODE_API_KEY` | opencode.ai/zen. Optional if every user brings their own key. |
| `AI_GATEWAY_API_KEY` | Your AI gateway. Must be set together with `AI_GATEWAY_BASE_URL`. |
| `AI_GATEWAY_BASE_URL` | e.g. `https://ai-gateway.example/v1` |
| `NEXT_PUBLIC_APP_URL` | The public origin. OAuth redirects use it instead of the request's host header. |
| `INTEGRATION_TOKEN_SECRET` | Generate one: `openssl rand -base64 48`. 32+ chars. |

### Schema push (new, and required)

The redesign adds one optional field to the `projects` table, and a
`rateLimits` table that backs the per-user API limits:

```ts
target: v.optional(v.union(v.literal("static"), v.literal("edge")))
```

It is optional, so existing rows are valid and no backfill is needed. Rows
without it are read through `resolveTarget()`, which infers the shape from the
files. Push it before deploying:

```bash
bun convex dev      # development
bun convex deploy   # production
```

### After merging the audit fixes (one-off)

1. **Push the schema and functions**: `bun convex deploy`. New tables
   (`projectVersionChunks`), indexes, crons (stale-run reaper, failure alerts) and
   the `migrations` module ship with it.
2. **Run the data migrations** on production, from the Convex dashboard or:

   ```bash
   npx convex run migrations:backfillLegacyProjects
   npx convex run migrations:clearVercelTokens
   ```

   Both are idempotent and continue themselves until done. Afterwards the legacy
   fields (`projects.html`, `pages`, `global*`, `userIntegrations.vercelAccessToken`),
   `lib/migration.ts` and the editor's client-side migration path can be deleted.
3. **Legacy ownerless projects** are now locked. If any exist, assign an owner:
   `npx convex run projects:assignOrphanOwner '{"projectName":"…","userId":"…"}'`.
4. **Cloudflare env var secrets** are re-encrypted bound to their project the next
   time each project's secrets are saved; old values keep working until then.
5. **Set the operational env vars** (all optional):

   | Where | Variable | Effect |
   | --- | --- | --- |
   | App | `ERROR_REPORT_WEBHOOK_URL` | Server and client errors are posted here as `{ text }` |
   | App | `CSP_ENFORCE=1` | Enforces the CSP in `proxy.ts` (report-only until then) |
   | Convex | `MAF_ALERT_WEBHOOK_URL` | Alert when runs fail in bulk |
   | Convex | `MAF_ALERT_FAILURE_THRESHOLD` | Failures per 15 minutes before alerting (default 5) |
   | Convex | `MAF_AI_DAILY_LIMIT` / `MAF_AI_MONTHLY_LIMIT` | Shared-key builds per user (defaults 100 / 1500) |

6. **Roll out the CSP**: watch the browser console for
   `Content-Security-Policy-Report-Only` violations on sign-in, the projects
   list and settings, then set `CSP_ENFORCE=1`. Enforcing renders pages
   dynamically (the nonce is per request).

---

## 2. Cloudflare. Required for the thing this product now is.

The redesign makes Cloudflare the default deploy target for **every** project,
static or edge. Without this, the primary path in the UI is unusable and users
fall through to the factory preview.

### The OAuth app

Register at the Cloudflare dashboard.

| Variable | Notes |
| --- | --- |
| `CLOUDFLARE_CLIENT_ID` | From the OAuth app |
| `CLOUDFLARE_CLIENT_SECRET` | From the OAuth app |
| `CLOUDFLARE_OAUTH_SCOPES` | Space separated, see below |

**Redirect URI**, one per environment:

```
http://localhost:3000/api/integrations/cloudflare/callback
https://<your-domain>/api/integrations/cloudflare/callback
```

### Scopes you have to request

The UI now surfaces D1, KV, R2, Queues, custom domains, secrets, and rollback,
so the token has to cover them. Missing a scope shows up as a runtime failure
in the deploy dialog, not at build time.

| Scope | Needed for |
| --- | --- |
| `account:read` | Listing accounts in the account picker |
| `user:read` | Identifying the authorizing user |
| `pages:write` | Creating the Pages project and uploading assets. **Both targets.** |
| `workers:write` | Worker-side resources, including R2 buckets and the object browser (R2 has no scope of its own) |
| `workers_scripts:write` | The Worker for an edge app, its secrets, and Durable Objects |
| `workers_routes:write` | Custom domains on the Worker |
| `d1:write` | Creating the database and applying migrations |
| `workers_kv:write` | KV namespaces |
| `vectorize:write` | Vectorize indexes |
| `queues:write` | Queue producers and consumers |
| `zone:read` | The custom-domain zone picker |
| `offline_access` | Refresh tokens, so the connection survives |

> Scope names must match Cloudflare's OAuth catalog exactly: one unknown name
> fails the whole consent screen. There is no `r2:write`; R2 comes with
> `workers:write`. Durable Objects ride on `workers_scripts:write`.
> `__tests__/cloudflare-oauth.test.ts` guards the defaults against typos.

### A test account

You need at least one Cloudflare account you are willing to have resources
created in, to walk the deploy path end to end. The confirmation gate means
nothing gets created accidentally, but you cannot verify the gate without
approving it once.

---

## 3. Optional integrations. Degrade cleanly if absent.

These are now labelled in the UI as mirrors and previews rather than as
alternative hosts, so leaving them unset is a coherent product, not a broken
one.

| Variable | Effect if missing |
| --- | --- |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | The GitHub mirror and the sync panel are unusable |
| `NETLIFY_CLIENT_ID` / `NETLIFY_CLIENT_SECRET` | Netlify hosting is unusable |
| `EXA_API_KEY` | "Reference a site" in the composer does nothing useful |

Redirect URIs follow the same shape:
`/api/integrations/<provider>/callback`.

---

## 4. Decisions I could not make for you

1. **Cost ceilings.** Deploys bill the user's own Cloudflare account. The plan
   and settings now label each resource as free tier, may bill, or paid plan,
   and settings can tear a deployment down, but there is no spend cap.

2. **The Netlify path for edge apps.** Hidden, because Netlify cannot run a
   Worker. Confirm you agree rather than wanting a partial static export.

3. **Where the app itself is hosted.** `@vercel/analytics` records
   `project_created`, `first_build_completed` and `deployed`, but only on
   Vercel. Elsewhere, swap it for that host's analytics.

4. **A separate origin for user content.** `/results` and `/preview` are
   sandboxed (opaque origin, no framing by other sites, noindex), which also
   means generated apps cannot use `localStorage` there. Serving them from a
   separate domain (`*.usercontent.<domain>`) would lift that and remove the
   phishing risk of user pages on the app's own domain. It needs DNS and
   hosting, so it is yours.

## 5. Still open

- **Visual regression.** No screenshot tests. `bun run test:e2e` covers the
  public pages and headers; signed-in flows need test accounts on Stack Auth
  and a Convex deployment to run against.
- **Dev-only advisories.** `bun audit` (all deps) still reports minimatch,
  picomatch and brace-expansion through ESLint's own dependencies, and
  `elliptic` (low, no fixed release) through Stack Auth. CI audits production
  dependencies at high severity.
- **Planned upgrades.** `ai` 7, `zod` 4.

---

## Verifying it works

```bash
bun install
bun convex dev        # pushes the schema
bun run dev
```

Then, in order:

1. Load `/`, pick **Static site**, describe something, build it.
2. In the editor, check the badge next to the project name says `static`.
3. Ask for something that needs storage. The badge should flip to `edge` once a
   Worker or migration appears.
4. Press **Deploy**. Cloudflare should be selected already and marked
   recommended.
5. Confirm the resource plan lists every resource with `create` or `reuse`, and
   that cancelling it creates nothing.
