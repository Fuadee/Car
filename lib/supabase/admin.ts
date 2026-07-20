const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

export function supabaseAdminRequest(path: string, init: RequestInit = {}) {
  if (!supabaseUrl || !serviceRoleKey)
    throw new Error("SUPABASE_NOT_CONFIGURED");

  // Supabase's new `sb_secret_...` keys authenticate through `apikey` only.
  // Legacy service-role JWTs still require the Bearer header.
  const headers = new Headers(init.headers);
  headers.set("apikey", serviceRoleKey);
  headers.set("Content-Type", "application/json");
  if (serviceRoleKey.startsWith("eyJ"))
    headers.set("Authorization", `Bearer ${serviceRoleKey}`);

  return fetch(`${supabaseUrl}/rest/v1/${path}`, {
    ...init,
    headers,
    cache: "no-store",
  });
}
