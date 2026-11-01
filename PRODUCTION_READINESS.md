# Production review

Reviewed on 2026-11-01. Local checks cover the application code and production build. Live integration checks remain before release.

## Changes

- Updated Next.js to 16.4.3 and Zod to 4.6.7. Updated dependency overrides for DOMPurify, Undici, source-map-js and sharp to versions outside the reported high and critical advisory ranges. Migrated record schemas and API response validator types to Zod 4.
- Deduplicated rate-limit buckets before reading or writing counters. Previously, a repeated bucket could create duplicate rows and cause subsequent quota reads to fail. Regression tests cover duplicate buckets and atomic refusal when a quota is exhausted.
- Applied the shared AI quotas to GitHub deployment description and README generation. These calls previously consumed only the deployment rate limit. A regression test verifies that exhausted quotas stop generation before repository creation.
- Removed the shared AI key requirement from readiness checks. Deployments using account BYOK settings can now report healthy. Tests cover BYOK readiness, database failure and a missing encryption key.
- Made the Convex production deployment job depend on both quality checks and end-to-end tests.

## Local validation

Passed the frozen Bun install, production dependency audit at high severity and above, TypeScript check, zero-warning lint, production build, 381 tests across 53 files, and all six Playwright smoke tests against the production build. Line coverage is 55.71%. No coverage threshold is configured.

## Release checks requiring live services

Follow [REQUIREMENTS.md](REQUIREMENTS.md) for environment variables, Convex migrations and provider scopes. Before release:

1. Configure Stack Auth, Convex, the public application URL and the encryption secret in the hosting environment. Keep the encryption secret stable across instances and releases.
2. Deploy Convex functions and run the documented legacy data migrations where applicable. Codegen drift checks require a deployment key and were not run locally during this review.
3. Verify sign-in, project creation, generation, cancellation, collaboration and owner-only operations against the production services.
4. Exercise Cloudflare OAuth, resource confirmation, deployment, rollback and teardown in a test account. Verify GitHub and Netlify paths if enabled.
5. Check CSP reports through sign-in and editing before enabling enforcement. CSP remains report-only by default.

Generated content still uses the application's origin with an opaque-origin sandbox. A separate content origin remains an infrastructure follow-up. Public smoke tests do not replace authenticated integration tests.

No production deployment, external resource creation, commit or push was performed by this review.
