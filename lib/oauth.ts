import { cookies, headers } from "next/headers";
import crypto from "crypto";

const COOKIE_MAX_AGE_SECONDS = 10 * 60;

export async function getBaseUrl() {
  const headerStore = await headers();
  const proto = headerStore.get("x-forwarded-proto") ?? "http";
  const host = headerStore.get("x-forwarded-host") ?? headerStore.get("host");
  return `${proto}://${host}`;
}

export function sanitizeReturnTo(input?: string | null) {
  if (!input) return "/";
  if (!input.startsWith("/")) return "/";
  if (input.startsWith("//")) return "/";
  return input;
}

export async function createOAuthStateCookie(cookieName: string, returnTo: string) {
  const state = crypto.randomUUID();
  const cookieStore = await cookies();
  cookieStore.set(cookieName, JSON.stringify({ state, returnTo }), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: COOKIE_MAX_AGE_SECONDS,
    path: "/",
  });
  return state;
}

export async function consumeOAuthStateCookie(cookieName: string, state: string) {
  const cookieStore = await cookies();
  const raw = cookieStore.get(cookieName)?.value;
  if (!raw) return null;
  cookieStore.delete(cookieName);
  try {
    const parsed = JSON.parse(raw) as { state?: string; returnTo?: string };
    if (!parsed.state || parsed.state !== state) return null;
    return sanitizeReturnTo(parsed.returnTo);
  } catch {
    return null;
  }
}
