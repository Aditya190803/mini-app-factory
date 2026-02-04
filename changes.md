# Changes Needed / Planned Work

This file tracks follow-up changes, cleanups, and quality-of-life improvements based on the current codebase state.

## Product/UI Changes (Done)
1. Replaced the **SEO/Metadata** action in the dashboard card with a **Settings** entry (`/edit/[projectName]/settings`).
2. Removed duplicate SEO entry from the editor header (Settings is now the single source of truth).
3. Deploy modal now shows linked repo and locks repo name once linked.
4. Netlify site name/subdomain shown in deploy results (and inferred from URL when missing).
5. Consistent account dropdown across app (new shared `AccountMenu`).

## Deployment Flow (Done)
1. Persist/reuse linked GitHub repo and disable repo edits once linked.
2. Repo name availability check + mismatch warning when linked repo name differs.
3. Netlify site name override supported.
4. Added **Redeploy** button on dashboard cards (dashboard redeploy modal).
5. Deploy modal now restores existing repo/deploy info when reopened.

## Settings / Integrations (Done)
1. Added **Global Integrations** status + last connected timestamps.
2. Added **Disconnect All** action.
3. Added **OAuth setup helper** link to docs.

## Auth / Logout Reliability (Done)
1. Shared account dropdown added; logout fixed in header dropdown.
2. Logout now routes through Stack sign-out handler for reliability.

## Documentation Updates (Done)
1. Docs + README updated to reflect **Netlify** as default deploy provider.
2. Added section describing the **project settings page** (`/edit/[projectName]/settings`).
3. Clarified linked repo reuse behavior + redeploy flow.

## Tech Debt / Quality of Life (Done + Remaining)
1. Centralized deployment logic (shared client/server helpers + error normalization).
2. Added deployment log/history per project (Convex table + UI display).
3. Added error toast in deploy modal.
4. Added repo name validation (length/characters).
5. API error normalization added (client helper).
6. Added tests for deploy helpers (repo reuse + SHA updates).
7. Remaining: regenerate Convex types (`npx convex dev`) after schema changes.

## Data Model / Storage (Updated)
1. Added fields: `netlifySiteName`, integration timestamps, deployment history table.
2. Project save calls now pass new deployment fields when relevant.
3. Remaining: decide if a migration/backfill is needed for existing records (optional).

## Cleanup (Done + Remaining)
1. Removed unused Vercel UI references (kept legacy server support).
2. Removed dead UI logic tied to old deploy options.
3. Remaining: quick sweep for any leftover unused imports after changes.
