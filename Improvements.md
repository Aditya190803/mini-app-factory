# Improvements

Below is a focused list of improvements based on a review of the current codebase.

## Security & Access Control
- Add authentication + ownership checks to the transform endpoint; it currently accepts arbitrary `files` input without verifying user/project ownership. See [app/api/transform/route.ts](app/api/transform/route.ts).
- Validate project access on all mutation-like API routes and ensure they operate on server-fetched project files rather than trusting client-supplied file payloads. See [app/api/transform/route.ts](app/api/transform/route.ts).
- Introduce per-user rate limiting / quotas on AI generation and transform endpoints to prevent abuse. See [app/api/generate/route.ts](app/api/generate/route.ts) and [app/api/transform/route.ts](app/api/transform/route.ts).
- Add strict allowlist validation for tool calls (tool name, args, file path normalization) before execution to reduce prompt/tool injection risk. See [lib/tool-executor.ts](lib/tool-executor.ts) and [app/api/transform/route.ts](app/api/transform/route.ts).

## Data Integrity & Validation
- Validate `POST /api/generate` payloads with a schema (Zod) similar to transform. See [app/api/generate/route.ts](app/api/generate/route.ts).
- Use `validateFileStructure()` to ensure generated/modified files always include required files (e.g., index.html). See [lib/page-builder.ts](lib/page-builder.ts), [app/api/generate/route.ts](app/api/generate/route.ts).
- Avoid trusting `files` from clients; fetch canonical files from storage and apply transforms server-side, then persist. See [lib/projects.ts](lib/projects.ts) and [app/api/transform/route.ts](app/api/transform/route.ts).
- Confirm metadata types remain aligned between Convex and frontend (e.g. `createdAt`/`updatedAt` stay numeric) to avoid drift. See [convex/schema.ts](convex/schema.ts) and [lib/projects.ts](lib/projects.ts).

## Type Safety & Technical Debt
- Remove `@ts-ignore` and `any` in tool executor/deploy code by typing csstree AST and SSE events. See [lib/tool-executor.ts](lib/tool-executor.ts) and [lib/deploy-client.ts](lib/deploy-client.ts).
- Replace `v.any()` legacy fields with explicit schemas or remove them after migration. See [convex/schema.ts](convex/schema.ts).
- Add a central env validation module (Zod) to fail fast on missing keys (AI providers, Stack, Convex). See [README.md](README.md) and any server entrypoints.

## Reliability & Error Handling
- Surface AI session errors to clients with structured error codes to drive UI state, not only strings. See [app/api/generate/route.ts](app/api/generate/route.ts).
- Add retry/backoff for transient AI provider errors and network errors, with clear max attempts. See [app/api/generate/route.ts](app/api/generate/route.ts) and [app/api/transform/route.ts](app/api/transform/route.ts).
- Ensure long-running sessions are always cleaned up on abort and failure paths, and log a request/trace ID for debugging. See [app/api/generate/route.ts](app/api/generate/route.ts).

## Performance
- Reduce large payload sizes by sending only changed files or patch deltas rather than full file arrays on transform. See [app/api/transform/route.ts](app/api/transform/route.ts).
- Cache or memoize AI-generated design specs for repeat prompts to avoid duplicate costs. See [app/api/generate/route.ts](app/api/generate/route.ts).
- Avoid parsing all project files into a single large prompt string; paginate context or add a file budget to keep token usage stable. See [app/api/transform/route.ts](app/api/transform/route.ts).

## Tooling & Linting
- Expand ESLint rules beyond the minimal setup (React hooks, Next.js, accessibility) to catch regressions earlier. See [eslint.config.cjs](eslint.config.cjs).
- Add a dedicated typecheck script (e.g., `tsc --noEmit`) and run it in CI along with lint/tests. See [package.json](package.json).
- Pin dependencies that are currently set to `latest` to reduce unexpected breakage. See [package.json](package.json).

## Testing
- Add tests for API routes (generate/transform/deploy) including error paths, auth failures, and tool execution behavior. See [__tests__/](__tests__/).
- Add unit tests for tool executor edge cases (CSS parsing, selectors not found, file type mismatches). See [lib/tool-executor.ts](lib/tool-executor.ts).

## UX & Product
- Provide clearer UI feedback for provider fallback, including which provider was used and how to retry. See [components/project-view.tsx](components/project-view.tsx).
- Show more actionable errors in the editor when transforms fail (invalid JSON/tool calls), with recovery suggestions. See [components/editor-workspace.tsx](components/editor-workspace.tsx).

## Documentation
- Document the tool-call schema and constraints (file naming, partials, selector rules) to improve prompt consistency. See [app/docs/page.tsx](app/docs/page.tsx).
- Remove Netlify-specific deployment instructions from public documentation to ensure content is strictly focused on what users need to see and core product functionality. See [app/docs/page.tsx](app/docs/page.tsx).
