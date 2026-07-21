import "server-only";

const bookingCodePattern = /^\d{6}$/;

export const isBookingCode = (value: string) => bookingCodePattern.test(value);

export const createBookingCode = () => {
  const value = crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000;
  return String(value).padStart(6, "0");
};

export async function hashBookingCode(code: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("MANAGEMENT_SECRET_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}
