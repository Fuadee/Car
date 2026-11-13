import "server-only";

type AttemptWindow = { failures: number; resetAt: number };

const attempts = new Map<string, AttemptWindow>();
const maxFailures = 5;
const windowMs = 10 * 60_000;

export const managerClientKey = (headers: Headers) =>
  headers.get("cf-connecting-ip") ??
  headers.get("x-real-ip") ??
  headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
  "unknown";

export function managerApprovalAllowed(key: string, now = Date.now()) {
  const window = attempts.get(key);
  if (!window) return true;
  if (window.resetAt <= now) {
    attempts.delete(key);
    return true;
  }
  return window.failures < maxFailures;
}

export function recordManagerApprovalFailure(key: string, now = Date.now()) {
  const window = attempts.get(key);
  if (!window || window.resetAt <= now) {
    attempts.set(key, { failures: 1, resetAt: now + windowMs });
    return;
  }
  window.failures += 1;
}

export const clearManagerApprovalFailures = (key: string) => attempts.delete(key);

const equalPin = async (provided: string, configured: string) => {
  const encoder = new TextEncoder();
  const [providedDigest, configuredDigest] = await Promise.all([
    crypto.subtle.digest("SHA-256", encoder.encode(provided)),
    crypto.subtle.digest("SHA-256", encoder.encode(configured)),
  ]);
  const left = new Uint8Array(providedDigest);
  const right = new Uint8Array(configuredDigest);
  let difference = left.length ^ right.length;
  for (let index = 0; index < Math.max(left.length, right.length); index += 1)
    difference |= (left[index] ?? 0) ^ (right[index] ?? 0);
  return difference === 0;
};

export async function verifyManagerPin(pin: string) {
  const configuredPin = process.env.MANAGER_APPROVAL_PIN;
  if (!configuredPin) return { ok: false as const, configured: false };
  return { ok: await equalPin(pin, configuredPin), configured: true };
}
