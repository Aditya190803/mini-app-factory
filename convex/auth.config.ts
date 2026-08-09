import { getConvexProvidersConfig } from '@stackframe/stack/convex-auth.config';

/**
 * Teaches Convex to verify Stack Auth JWTs, so `ctx.auth.getUserIdentity()` works inside query and
 * mutation handlers.
 *
 * Until this existed, every Convex function was public and derived ownership from a `userId`
 * string supplied by the caller — which meant the deployment URL (public by construction, it ships
 * in the client bundle as NEXT_PUBLIC_CONVEX_URL) was enough to read any user's OAuth tokens and
 * API keys, and to overwrite any project. Identity now comes from a signed token instead.
 *
 * Requires STACK_PROJECT_ID to be set on the Convex deployment itself:
 *
 *   npx convex env set STACK_PROJECT_ID <your Stack project id>
 *
 * This is Convex's own environment, separate from .env.local — the value is the same as
 * NEXT_PUBLIC_STACK_PROJECT_ID.
 */
const projectId = process.env.STACK_PROJECT_ID;

if (!projectId) {
  throw new Error(
    'STACK_PROJECT_ID is not set on the Convex deployment. Run: npx convex env set STACK_PROJECT_ID <id>'
  );
}

export default {
  providers: getConvexProvidersConfig({ projectId }),
};
