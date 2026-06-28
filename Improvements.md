# Improvements

Focused backlog after the open-lovable cherry-pick (transform hardening, edit intent, Exa URL context, transform SSE).

## Done (recent)

- Transform: auth, ownership, orphan claim, rate limit, strict Zod payload (no client `files`), canonical `getFiles`, SSE progress events.
- Edit intent: manifest, analyzer, context budget, transform prompt wiring.
- Exa reference URL at generation + optional `EXA_API_KEY`.
- Shared `lib/sse-writer.ts` (generate + transform), `lib/transform-run.ts`, `hooks/use-project-transform.ts`.
- API route tests for generate, transform, url-context, project-access, edit-intent.

## Security & Access Control

- `assertCanAccessProject` used on generate, deploy, readme, preview, and `GET /api/project/[name]` (auth required for poll fallback).
- Strict allowlist validation for tool calls (tool name, args, path normalization) before execution. See `lib/tool-executor.ts`.

## Data Integrity & Validation

- `POST /api/generate` uses Zod + `validateFileStructure()` — keep aligned when generation output format changes.
- Metadata alignment between Convex and `lib/projects.ts` (`createdAt`/`updatedAt` numeric).

## Type Safety & Technical Debt

- Remove `@ts-ignore` and `any` in tool executor / deploy client where feasible.
- Replace `v.any()` legacy Convex fields after migration completes.
- Central env validation (`lib/env.ts`) — `EXA_API_KEY`, `MAF_ADMIN_EMAILS` added; extend as new keys are added.

## Reliability & Error Handling

- Transform: `SAVE_FAILED`, `ABORTED` codes; client abort via `AbortSignal` on fetch.
- Ensure AI sessions are destroyed on all paths (transform-run `finally`).

## Performance

- Transform already returns file deltas for project saves; keep context budget (`MAX_TRANSFORM_CONTEXT_CHARS`).
- Design-spec cache on generate (`lib/ai-cache.ts`).

## Tooling & Linting

- CI uses `bun run test:ci` (`vitest run`).
- Pin `latest` dependencies in `package.json` when practical.
- Expand ESLint beyond minimal config (hooks, a11y).

## Testing

- Use **`bun run test`** (Vitest), not raw `bun test` — the latter mis-loads Vitest suites.
- Add tool-executor edge-case tests (CSS, missing selectors).
- Optional: transform route test for `SAVE_FAILED` SSE error.

## UX & Product

- Provider fallback messaging in `project-view` (which provider ran).
- Document tool-call schema in `app/docs/page.tsx`.

## Documentation

- README: `EXA_API_KEY`, reference URL stored in `project.description` when set at check-name.
- Trim deploy-only noise from user-facing docs if not product-critical.