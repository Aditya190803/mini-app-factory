# Mini App Factory

Describe an application in plain language. Read the files it produces. Publish
them to your own Cloudflare account.

## What it makes

Every project compiles to one of exactly two shapes, and the shape is read off
the files rather than set as a mode you have to remember.

**Static site.** Pages, styles, browser scripts. Uploaded to Cloudflare Pages as
a plain asset bundle. Nothing billable.

**Edge app.** The same bundle plus a `_worker.js` and, usually, stored data:
D1, KV, R2, Queues, Vectorize, or Durable Objects, declared in a
`cloudflare.manifest.json` you can read and edit.

A project becomes an edge app the moment it contains a Worker, a SQL migration,
or a Cloudflare config file. See `lib/targets.ts`.

## How it behaves

- **Nothing is created without asking.** The deploy dialog shows the exact list
  of Cloudflare resources, each labelled `create` or `reuse`, and does nothing
  until you approve it.
- **Migrations are guarded.** One that has already been applied cannot be
  edited afterwards, and a destructive one is refused outright.
- **Every successful build is restorable.** From the version history in the
  conversation pane.
- **The output is portable.** Ordinary web files and standard Wrangler config.
  Export a zip or push to a repo you own; deleting this account does not take
  your app down.

## Deploy surfaces

| Surface | Hosts | Notes |
| --- | --- | --- |
| **Cloudflare** | static and edge | The default. Into your own account. |
| Cloudflare preview | static and edge | Throwaway subdomain with preview-suffixed resources. Expires on its own. |
| Factory preview | static only | Served from this app. No account needed. |
| GitHub mirror | neither | Pushes the bundle to a repo. Hosts nothing. |
| Netlify | static only | Mirrors to GitHub, then hosts the assets. No Worker runtime. |

## Stack

- **Framework**: Next.js 16, App Router
- **Database**: Convex
- **Auth**: Stack Auth
- **Models**: OpenCode Zen and OpenRouter, both fetched live on every visit,
  never hardcoded
- **Styling**: Tailwind CSS v4, plus the Plate design system in
  `app/globals.css` and `components/kit/`
- **Runtime**: Bun

## Design

The interface is documented in [`DESIGN.md`](DESIGN.md). The short version:
a drafting plate. Ink on warm paper, hairline rules, dense spec tables, one deep
red-lead accent used only for the primary action, the current selection, and
anything live. Dark by default.

Product intent is in [`PRODUCT.md`](PRODUCT.md).

## Running it

```bash
bun install
bun convex dev     # pushes the schema, including the `target` field
bun run dev
```

Open http://localhost:3000.

Environment variables, OAuth scopes, and the decisions still outstanding are all
in [`REQUIREMENTS.md`](REQUIREMENTS.md). The Cloudflare OAuth scope list in
particular is worth reading before the first deploy: a missing scope surfaces as
a runtime failure in the deploy dialog, not at build time.

## Checks

```bash
bun run typecheck
bun run lint
bun run test:ci
bun run build
```

## Layout

```
app/                    routes
components/kit/         the whole component vocabulary
components/shell/       top bar, footer, account, theme, model picker
components/brand/       the mark and lockup
components/landing/     landing page sections
components/editor/      workspace panes
lib/targets.ts          build targets and deploy surfaces
lib/cloudflare*.ts      manifest parsing, provisioning, deployment
convex/                 schema and server functions
```
