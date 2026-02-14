# Mini App Factory — Improvement Plan

> Full codebase audit, categorized by domain with severity ratings.
> **Severity**: 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## Table of Contents

- [1. Security](#1-security)
- [2. Performance](#2-performance)
- [3. Code Quality](#3-code-quality)
- [4. Architecture & Tech Debt](#4-architecture--tech-debt)
- [5. Testing](#5-testing)
- [6. DevOps / CI](#6-devops--ci)
- [7. Accessibility](#7-accessibility)
- [8. SEO](#8-seo)
- [9. UX](#9-ux)
- [Priority Matrix](#priority-matrix)

---

## 1. Security

### 🔴 Critical

- [x] **S1 — Hardcoded admin email**: `ADMIN_EMAIL = 'aditya.mer@somaiya.edu'` in `lib/admin-access.ts`. Move to env var or a database-backed admin list.
- [x] **S2 — XSS via raw HTML serving on `/results/` route**: User-generated HTML served with no sanitization and no CSP headers at `app/results/[projectName]/[[...path]]/route.ts`. Malicious script tags execute in the user's browser.
- [x] **S3 — No CSRF protection on POST endpoints**: All state-mutating API routes (`generate`, `deploy`, `transform`, `check-name`) accept JSON with no CSRF token or origin validation. Cross-origin POST attacks are possible.
- [x] **S4 — No input validation on `check-name` route**: `app/api/check-name/route.ts` destructures `name, prompt, selectedModel, providerId` from raw `req.json()` with no Zod validation. Only `name` has a regex check; other fields are passed to `saveProject` unchecked.

### 🟠 High

- [ ] **S5 — OAuth tokens stored in plaintext**: GitHub, Vercel, and Netlify tokens in Convex have zero encryption at rest. If the database is compromised, all integration tokens are exposed.
- [x] **S6 — Preview iframe sandbox too permissive**: `sandbox="allow-scripts allow-same-origin allow-forms"` in `components/preview-panel.tsx` effectively nullifies the sandbox — generated code can access parent cookies and storage.
- [ ] **S7 — BYOK API keys transmitted in headers unencrypted**: User API keys are base64-encoded in the `x-maf-ai-byok` header (`lib/ai-admin-server.ts`). Any intermediary (logs, CDN) can read them.
- [x] **S8 — Rate limiting is in-memory only**: `lib/rate-limit.ts` uses a `Map` in process memory. Resets on every deploy/restart, trivially bypassed in multi-instance deployments, and grows unbounded (memory leak).
- [x] **S9 — Legacy/guest projects deployable by any authenticated user**: `app/api/deploy/route.ts` allows any authenticated user to deploy projects without a `userId` — intentional but dangerous authorization gap.

### 🟡 Medium

- [x] **S10 — No Content-Security-Policy headers**: No CSP configured anywhere. Generated sites served from `/results/` can execute arbitrary scripts.
- [x] **S11 — Admin access gated by email string only**: `isAdminEmail(user.primaryEmail)` in admin settings route. Email is self-reported by auth provider and could be spoofed.
- [x] **S12 — Design spec cache key includes prompt text**: Cache key is `${model}:${providerId}:${prompt}` in `app/api/generate/route.ts`. If prompt contains PII, it persists in memory for 15 minutes.

---

## 2. Performance

### 🟠 High

- [ ] **P1 — `editor-workspace.tsx` is 1900+ lines**: Monolithic `'use client'` component with 40+ `useState` hooks. Entire component and all its 15+ imports are bundled client-side. Split into smaller composable components.
- [ ] **P2 — `dashboard/page.tsx` is a 619-line client component**: Entire dashboard including dialogs is one massive `'use client'` page. Use a Server Component shell with client-only interactive islands.
- [x] **P3 — CodeMirror imported eagerly**: `import CodeMirror from '@uiw/react-codemirror'` (~200KB) is a top-level import in `components/preview-panel.tsx`. Should use `next/dynamic` with `{ ssr: false }` since it's only shown when the code tab is active.
- [x] **P4 — Deploy route uploads files sequentially**: `app/api/deploy/route.ts` uploads to GitHub one file at a time in a `for` loop. Use GitHub's Git Trees API for batch commits.
- [x] **P5 — In-memory design spec cache has no max size**: `designSpecCache` in `lib/ai-cache.ts` is an unbounded `Map`. Design specs can be large strings — server will OOM over time.

### 🟡 Medium

- [x] **P6 — In-memory job store in `site-builder.ts`**: `const _jobs: Record<string, BuildJob> = {}` — unbounded, never cleaned up. Memory leak.
- [x] **P7 — `framer-motion` imported for minimal usage**: Adds ~30KB to client bundle in `components/editor-workspace.tsx` for basic fade/presence animations. Consider CSS animations or `motion` lite.
- [x] **P8 — Duplicate SSE writer implementations**: `createSSEWriter` is defined separately in both `app/api/generate/route.ts` and `app/api/deploy/route.ts`. Extract to a shared `lib/sse.ts`.
- [x] **P9 — No caching on `assembleFullPage` for results/preview**: `getFiles()` + `assembleFullPage()` called on every single page view in preview and results routes with no caching.
- [x] **P10 — Auto-save triggers on every keystroke**: 2-second debounced save on every `files` state change, plus a 1-second history timer, causes double writes in `components/editor-workspace.tsx`.

---

## 3. Code Quality

### 🔴 Critical

- [x] **Q1 — Zero `error.tsx` boundaries in the entire app**: No `error.tsx` files exist anywhere in `app/`. Unhandled runtime errors show a blank page or the default Next.js error screen. Every route segment needs an error boundary.

### 🟠 High

- [x] **Q2 — `loading.tsx` renders empty fragment**: `app/loading.tsx` returns `<></>` — users see a blank screen during Suspense transitions. Needs a proper loading skeleton/spinner.
- [x] **Q3 — `dashboard/page.tsx` uses `confirm()` and `alert()`**: Browser native dialogs for delete confirmation and error messages instead of the existing `Dialog` component / `sonner` toast.
- [x] **Q4 — `preview-panel.tsx` uses `alert()` extensively**: Multiple `alert()` calls for confirmations and errors. Should use `toast()` from sonner (already installed).
- [x] **Q5 — `prompt-panel.tsx` has hardcoded model list**: 3 hardcoded model options while the admin console supports dynamic model management. The panel ignores admin config entirely.
- [x] **Q6 — `preview-panel.tsx` (root) duplicates `editor-workspace.tsx`**: A 447-line legacy component with its own transform/save/download/import/export logic — all of which already exists in `editor-workspace.tsx`. Likely dead code.
- [x] **Q7 — Duplicate `buildMainPrompt` / `buildPolishPrompt`**: Both `lib/site-builder.ts` and `lib/utils.ts` export these functions. The generate route imports from `utils`, while `site-builder.ts` has its own versions.

### 🟡 Medium

- [x] **Q8 — `parseStreamingOutput` generator is incomplete**: `lib/file-parser.ts` has a TODO and yields the full array on every call instead of individual files — defeating the streaming purpose.
- [x] **Q9 — `sendAIMessage` exported from route file**: `app/api/transform/route.ts` exports `sendAIMessage` — utility function that belongs in a lib file, not a route handler.
- [x] **Q10 — Magic numbers scattered throughout**: Timeouts (`300`, `120_000`), cache TTLs (`15 minutes`), and limits are inline magic numbers. Should be constants in a shared config.
- [x] **Q11 — Hardcoded default model in `prompt-panel.tsx`**: `useState('gemini-3-flash-preview')` doesn't reflect admin config or user preferences.
- [x] **Q12 — `ignoreBuildErrors: true` in `next.config.mjs`**: TypeScript errors are silently swallowed during builds. This masks real issues that should be caught before deployment.

### 🟢 Low

- [x] **Q13 — Inconsistent use of `NextResponse` vs `Response`**: `check-name/route.ts` uses `NextResponse.json()`, `generate/route.ts` uses `Response.json()`. Pick one pattern.

---

## 4. Architecture & Tech Debt

### 🟠 High

- [ ] **A1 — Dual data layer: Convex client SDK + HTTP client**: `lib/ai-settings-store.ts` uses `ConvexHttpClient` directly, while components use `useQuery`/`useMutation`. Two different data access patterns make caching and consistency hard.
- [ ] **A2 — `lib/projects.ts` vs `convex/projects.ts` overlapping responsibilities**: API routes use the lib HTTP wrapper, components use Convex hooks directly. No single source of truth for authorization logic.
- [x] **A3 — `site-builder.ts` is mostly dead code**: Contains `BuildJob`, `parseAndSaveCodeBlocks` (writes to filesystem), in-memory job tracking — none used by the actual generate/transform flow (SSE + Convex). Vestigial module from an earlier architecture.
- [x] **A4 — Two preview panels exist**: `components/preview-panel.tsx` (legacy, with localStorage logic) vs `components/editor/preview-panel.tsx` (current). Creates confusion about which is authoritative.
- [x] **A5 — `ai-tools.ts` disconnected from `tool-executor.ts`**: `ai-tools.ts` defines tool schemas (`batchEdit`, `renameFile`) that don't match `tool-executor.ts`'s `ALLOWED_TOOLS` set or the system prompt (`updateFile`, `replaceElement`).

### 🟡 Medium

- [x] **A6 — Default model string repeated in 3+ locations**: `'gemini-3-flash-preview'` in `generate/route.ts`, `site-builder.ts`, and `prompt-panel.tsx`. Should be a single config constant.
- [ ] **A7 — OAuth tokens have no refresh/expiry logic**: `app/api/deploy/route.ts` fetches tokens and uses them directly with no expiration check and no refresh flow. Deployments silently fail with stale tokens.
- [x] **A8 — `cleanupLegacyFields` mutation still exists**: One-time migration in `convex/projects.ts` that should be removed after migration is complete.

---

## 5. Testing

### 🟠 High

- [ ] **T1 — No component tests**: All tests in `__tests__/` cover API routes and lib functions. Zero React component tests for `editor-workspace`, `dashboard`, `preview-panel`, etc.
- [ ] **T2 — No integration/E2E tests**: No Playwright, Cypress, or similar. Critical user flows (generate → edit → deploy) are never tested end-to-end.
- [ ] **T3 — No test for the public `/results/` route**: The most security-critical route (serves raw HTML to the public) has zero test coverage.

### 🟡 Medium

- [ ] **T4 — No test for `check-name` route**: Project name reservation endpoint is untested.
- [ ] **T5 — No test for rate limiting edge cases**: In-memory state makes rate limiter fragile and hard to test.
- [ ] **T6 — No test for `ai-cache.ts` TTL expiry**: Cache has time-based expiry logic that's never tested.

---

## 6. DevOps / CI

### 🟡 Medium

- [x] **D1 — No pre-commit hooks**: No `.husky/`, `lint-staged`, or `pre-commit` config. Un-linted, un-typed code can be pushed directly.
- [x] **D2 — CI never runs `build`**: `.github/workflows/ci.yml` runs `typecheck`, `lint`, `test` but never `bun run build`. Build errors are only caught at deployment time.
- [x] **D3 — No dependency vulnerability scanning**: No `bun audit`, no Dependabot/Renovate configuration. Vulnerable dependencies aren't flagged.
- [ ] **D4 — No staging/preview environment**: Changes appear to go directly to production. No evidence of preview deploys.

### 🟢 Low

- [x] **D5 — Bun version pinned to 1.3.9 in CI**: Should match development version. No `.bun-version` or `engines` field in `package.json`.

---

## 7. Accessibility

### 🟠 High

- [x] **A11-1 — Back button uses `←` with no accessible label**: `<button>←</button>` in `app/dashboard/page.tsx` — no `aria-label`, screen readers read "left-pointing arrow".
- [x] **A11-2 — Tiny text sizes throughout**: Extensive use of `text-[8px]`, `text-[9px]`, `text-[10px]` in dashboard — well below WCAG minimum (~7pt). Illegible on many screens.
- [x] **A11-3 — No skip-to-content link**: `components/header.tsx` has no skip-navigation link for keyboard users.
- [x] **A11-4 — Color contrast not guaranteed**: Colors like `var(--muted-text)` on `var(--background)` with opacity modifiers (`opacity-50`, `opacity-20`) — no evidence these meet 4.5:1 ratio.
- [x] **A11-5 — Custom radio buttons have no ARIA roles**: Deploy option `<button>` elements in dashboard act as radio buttons but have no `role="radio"`, `aria-checked`, or `aria-labelledby`.

### 🟡 Medium

- [x] **A11-6 — Decorative `∅` character not hidden from assistive tech**: `∅` in `app/dashboard/page.tsx` should have `aria-hidden="true"`.
- [x] **A11-7 — Hover states use JS handlers instead of CSS `:hover`**: `onMouseEnter`/`onMouseLeave` in `components/prompt-panel.tsx` — doesn't fire on keyboard focus.

---

## 8. SEO

### 🟡 Medium

- [x] **SEO1 — Dashboard page has no metadata**: `'use client'` page with no `metadata` export and no `<title>`.
- [x] **SEO2 — Edit page has no dynamic metadata**: Server Component at `app/edit/[projectName]/page.tsx` doesn't export `generateMetadata`.
- [x] **SEO3 — Results route serves HTML with no caching headers**: No `Cache-Control` header. Doesn't opt into CDN caching.
- [x] **SEO4 — No `robots.txt` or `sitemap.xml`**: Public project pages at `/results/` are not discoverable by search engines.
- [x] **SEO5 — No OG tags on app pages**: Only generated sites get OG tags. The app itself (landing, dashboard, docs) has none beyond the basic root metadata.

---

## 9. UX

### 🟠 High

- [x] **UX1 — No visual loading state during generation**: Empty fragment in `app/loading.tsx` means blank white screen during Suspense transitions.
- [x] **UX2 — Native `confirm()` for destructive actions**: Browser dialogs are jarring and un-styled. Use the existing `Dialog` component for delete confirmations.
- [x] **UX3 — No optimistic updates for project deletion**: Delete waits for mutation to complete before updating UI. Should remove the card immediately and restore on error.

### 🟡 Medium

- [ ] **UX4 — 40+ state variables in `EditorWorkspace`**: Makes debugging impossible. Should use `useReducer` or a state manager (zustand/xstate).
- [ ] **UX5 — No keyboard shortcuts help panel**: Quick-open, undo/redo, and other shortcuts exist but aren't documented to users.
- [x] **UX6 — Deploy dialog refetches integration status on every open**: Should cache integration status with a short TTL instead of fetching fresh each time.
- [x] **UX7 — No pagination on dashboard**: `getUserProjects` uses `.collect()` fetching all projects. Will degrade for prolific users. Needs pagination or virtual scrolling.
- [x] **UX8 — History silently drops oldest entries at 50**: No indication to the user. Undo history appears corrupted from user's perspective.

---

## Priority Matrix

> Sorted by **risk × effort ratio** — highest-impact, lowest-effort items first.

| Priority | Item | Effort | Impact |
|----------|------|--------|--------|
| 1 | **Q1** — Add `error.tsx` boundaries | Low | Critical resilience |
| 2 | **S2 + S10** — CSP headers + sanitize `/results/` | Medium | Critical XSS fix |
| 3 | **Q2** — Real loading state in `loading.tsx` | Low | Major UX win |
| 4 | **P3** — Lazy-load CodeMirror | Low | ~200KB bundle reduction |
| 5 | **Q3 + Q4** — Replace `alert()`/`confirm()` with `toast()`/`Dialog` | Low | UX consistency |
| 6 | **S1** — Move admin email to env var | Low | Security hygiene |
| 7 | **S4** — Add Zod validation to `check-name` | Low | Input safety |
| 8 | **D2** — Add `build` step to CI | Low | Catch build errors early |
| 9 | **Q12** — Remove `ignoreBuildErrors: true` | Low | Surface real TS errors |
| 10 | **P1** — Split `editor-workspace.tsx` | High | Maintainability |
| 11 | **A3 + Q6** — Remove dead code (`site-builder`, legacy preview panel) | Medium | Reduce confusion |
| 12 | **S6** — Tighten iframe sandbox | Low | Security hardening |
| 13 | **T1 + T2** — Add component tests + E2E | High | Long-term reliability |
| 14 | **S8** — Persistent rate limiting (Redis/KV) | Medium | Production readiness |
| 15 | **A7** — OAuth token refresh logic | Medium | Deployment reliability |
