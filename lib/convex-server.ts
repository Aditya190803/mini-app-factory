import 'server-only';
import { ConvexHttpClient } from 'convex/browser';
import { stackServerApp } from '@/stack/server';

const CONVEX_URL = process.env.NEXT_PUBLIC_CONVEX_URL!;

/**
 * A Convex client carrying the current request's Stack Auth identity.
 *
 * Convex functions derive `userId` from `ctx.auth.getUserIdentity()` rather than from an argument,
 * so any server-side call that touches per-user data has to present the user's token. Server
 * helpers previously shared one unauthenticated module-level client, which is why every Convex
 * function had to trust a caller-supplied `userId`.
 *
 * A fresh client per call is deliberate: the token belongs to one request, and ConvexHttpClient is
 * cheap to construct. Sharing one would leak identity across concurrent requests.
 *
 * Throws when there is no signed-in user — callers that legitimately serve anonymous traffic
 * should use `getPublicConvexClient` instead, so the distinction stays visible at the call site.
 */
export async function getAuthedConvexClient(): Promise<ConvexHttpClient> {
  const user = await stackServerApp.getUser();
  if (!user) {
    throw new Error('Convex call requires an authenticated user');
  }

  const token = await user.getAccessToken();
  if (!token) {
    throw new Error('Could not obtain a Stack Auth access token for the current user');
  }

  const client = new ConvexHttpClient(CONVEX_URL);
  client.setAuth(token);
  return client;
}

/**
 * An unauthenticated Convex client, for the genuinely public paths — serving a published site at
 * `/results/*`. Only functions that are safe to expose anonymously may be called with this.
 */
export function getPublicConvexClient(): ConvexHttpClient {
  return new ConvexHttpClient(CONVEX_URL);
}
