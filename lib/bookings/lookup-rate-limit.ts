import "server-only";

type AttemptWindow = { failures: number; resetAt: number };

const attempts = new Map<string, AttemptWindow>();
const maxFailures = 5;
const windowMs = 10 * 60_000;

export const lookupClientKey = (headers: Headers) =>
  headers.get("cf-connecting-ip") ??
  headers.get("x-real-ip") ??
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  "unknown";

export function lookupAllowed(key: string, now = Date.now()) {
  const window = attempts.get(key);
  if (!window) return true;
  if (window.resetAt <= now) {
    attempts.delete(key);
    return true;
  }
  return window.failures < maxFailures;
}

export function recordLookupFailure(key: string, now = Date.now()) {
  const window = attempts.get(key);
  if (!window || window.resetAt <= now) {
    attempts.set(key, { failures: 1, resetAt: now + windowMs });
    return;
  }
  window.failures += 1;
}

export const clearLookupFailures = (key: string) => attempts.delete(key);
