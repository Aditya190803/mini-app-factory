import 'server-only';

import { cookies, headers } from "next/headers";
import crypto from "crypto";

const COOKIE_MAX_AGE_SECONDS = 10 * 60;

/**
 * The app's public origin, for OAuth redirect URIs and post-login redirects.
 *
 * Uses NEXT_PUBLIC_APP_URL when set. The fallback reads the Host header, never X-Forwarded-Host:
 * that header is client-controlled unless a proxy overwrites it, and trusting it let a request
 * choose where the OAuth callback (and its code) was sent.
 */
export async function getBaseUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (configured) return configured;
  const headerStore = await headers();
  const proto = headerStore.get("x-forwarded-proto") === "https" ? "https" : "http";
  return `${proto}://${headerStore.get("host")}`;
}

const RETURN_TO_BASE = "https://return-to.invalid";

/**
 * A same-origin path to return to, or "/". Parsed as a URL rather than prefix-checked: browsers
 * treat `/\evil.com` and `/\t/evil.com` as protocol-relative, which slipped past the old
 * `startsWith("//")` check and turned the OAuth return into an open redirect.
 */
export function sanitizeReturnTo(input?: string | null) {
  if (!input || !input.startsWith("/") || /[\\\u0000-\u001f]/.test(input)) return "/";
  try {
    const url = new URL(input, RETURN_TO_BASE);
    if (url.origin !== RETURN_TO_BASE) return "/";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return "/";
  }
}

/** A PKCE verifier and its S256 challenge. */
export function createPkcePair() {
  const verifier = crypto.randomBytes(32).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export async function createOAuthStateCookie(cookieName: string, returnTo: string, codeVerifier?: string) {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(cookieName, JSON.stringify({ state, returnTo, codeVerifier }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return state;
}

/** Validate and consume the state cookie. Returns the return path and any PKCE verifier. */
export async function consumeOAuthState(cookieName: string, state: string) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(cookieName)?.value;
  if (!raw) return null;
  cookieStore.delete(cookieName);
  try {
    const parsed = JSON.parse(raw) as { state?: string; returnTo?: string; codeVerifier?: string };
    if (!parsed.state || parsed.state !== state) return null;
    return { returnTo: sanitizeReturnTo(parsed.returnTo), codeVerifier: parsed.codeVerifier };
  } catch {
    return null;
  }
}

export async function consumeOAuthStateCookie(cookieName: string, state: string) {
  return (await consumeOAuthState(cookieName, state))?.returnTo ?? null;
}
