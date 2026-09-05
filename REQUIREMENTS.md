# What this needs from you

Everything in the redesign builds, typechecks, lints, and passes its tests
already. This file is the list of things **only you can do**, because they need
accounts, dashboards, or decisions that are yours.

Ordered by whether the app works without them.

---

## 1. Blocking. The app does not run without these.

These already existed before the redesign. Listed so the list is complete.

| Variable | Where to get it |
| --- | --- |
| `NEXT_PUBLIC_CONVEX_URL` | `bun convex dev`, or the Convex dashboard |
| `CONVEX_DEPLOYMENT_KEY` | Convex dashboard, Settings, Deploy keys |
| `NEXT_PUBLIC_STACK_PROJECT_ID` | Stack Auth dashboard |
| `NEXT_PUBLIC_STACK_PUBLISHABLE_CLIENT_KEY` | Stack Auth dashboard |
| `STACK_SECRET_SERVER_KEY` | Stack Auth dashboard |
| `OPENCODE_API_KEY` | opencode.ai/zen |
| `OPENROUTER_API_KEY` | openrouter.ai/keys |
| `INTEGRATION_TOKEN_SECRET` | Generate one: `openssl rand -base64 48`. 32+ chars. |

### Schema push (new, and required)

The redesign adds one optional field to the `projects` table:

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
| `workers_scripts:write` | The Worker for an edge app |
| `d1:write` | Creating the database and applying migrations |
| `workers_kv_storage:write` | KV namespaces |
| `r2:write` | Buckets, plus the object browser in project settings |
| `queues:write` | Queue producers and consumers |
| `zone:read` | The custom-domain zone picker |
| `offline_access` | Refresh tokens, so the connection survives |

> Decide now whether you want Vectorize and Durable Objects in the first
> release. `lib/cloudflare-manifest.ts` already accepts both, and the landing
> page mentions them. If you are not scoping for them, cut them from
> `components/landing/bento.tsx` and the docs, or you are promising something
> the deploy will refuse.

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
| `VERCEL_CLIENT_ID` / `VERCEL_CLIENT_SECRET` | Vercel callbacks are unusable |
| `EXA_API_KEY` | "Reference a site" in the composer does nothing useful |

Redirect URIs follow the same shape:
`/api/integrations/<provider>/callback`.

---

## 4. Decisions I could not make for you

1. **The admin allowlist.** `lib/admin-access.ts` still hardcodes
   `aditya.mer@somaiya.edu`. Fine for one person, wrong the moment there are
   two. Move it to an env var or a Convex table.

2. **Vectorize and Durable Objects.** See the scope note above. Promise them or
   cut them, but do not ship the gap.

3. **Cost ceilings.** Deploys now bill the user's own Cloudflare account. The
   terms say so plainly, and the plan gate shows what will be created, but
   there is no spend cap and no usage display. If you expect non-technical
   users, that is a real gap.

4. **The Netlify path for edge apps.** Currently hidden, because Netlify cannot
   run a Worker. That is honest. Confirm you agree rather than wanting a
   partial static export there.

5. **Where the app itself is hosted.** The `.vercel` directory says Vercel.
   Nothing here forces that, but "Cloudflare-first" hosted on Vercel is a
   question a user will ask. `@vercel/analytics` is still wired into the root
   layout.

6. **Whether the landing page keeps stock imagery.** The pinned scroll section
   uses four `picsum.photos` images, heavily desaturated and treated. They are
   placeholders. Real screenshots of the editor would be stronger, and I could
   not take those without a running instance with real projects in it.

---

## 5. Things worth doing that I did not

- **Visual regression.** There is no screenshot testing, so a token change can
  silently break a surface. The build and 246 unit tests catch types and logic,
  not layout.
- **A contrast test.** The palette was designed to hit AA and the reasoning is
  in `DESIGN.md`, but nothing in CI enforces it. A test over the token values
  would.
- **`lib/site-builder.ts`.** Still holds an in-memory job registry that predates
  the Convex run model. It is dead weight and confusing next to
  `lib/transform-run.ts`. Untouched here because deleting it is a behaviour
  change, not a redesign.
- **Backfilling `target`.** Not required, because it is inferred. But a
  one-time backfill would let the dashboard filter on an index instead of in
  memory once there are a lot of projects.

---

## Verifying it works

```bash
bun install
bun convex dev        # pushes the target field
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
