"use client";

import { ReactNode, useCallback, useMemo } from "react";
import { ConvexProviderWithAuth, ConvexReactClient } from "convex/react";
import { useUser } from "@stackframe/stack";
import { stackClientApp } from "@/stack/client";

const convex = new ConvexReactClient(process.env.NEXT_PUBLIC_CONVEX_URL!);

/**
 * Bridges Stack Auth into Convex so browser-issued queries and mutations carry a verified
 * identity.
 *
 * This provider used to be a bare `ConvexProvider`, meaning no token ever reached Convex and
 * every function ran unauthenticated. Convex functions now read `ctx.auth.getUserIdentity()`, so
 * without this bridge the app would be signed out from Convex's point of view.
 */
function useAuthFromStack() {
  const user = useUser();

  // `undefined` = still resolving. Distinguishing that from "signed out" matters: Convex waits
  // rather than treating the session as anonymous while it loads.
  const isLoading = user === undefined;
  const isAuthenticated = Boolean(user);

  const stackAuth = useMemo(
    () => stackClientApp.getConvexClientAuth({ tokenStore: "nextjs-cookie" }),
    []
  );
  const fetchAccessToken = useCallback(async (args: { forceRefreshToken: boolean }) => {
    if (!user) return null;
    try {
      return await stackAuth(args);
    } catch {
      return null;
    }
  }, [stackAuth, user]);

  return useMemo(
    () => ({ isLoading, isAuthenticated, fetchAccessToken }),
    [isLoading, isAuthenticated, fetchAccessToken]
  );
}

export function ConvexClientProvider({ children }: { children: ReactNode }) {
  return (
    <ConvexProviderWithAuth client={convex} useAuth={useAuthFromStack}>
      {children}
    </ConvexProviderWithAuth>
  );
}
