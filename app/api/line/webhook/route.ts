type LineWebhookPayload = {
  events?: unknown;
};

const jsonResponse = (body: object, status = 200) =>
  Response.json(body, { status });

const decodeBase64 = (value: string) => {
  const decoded = atob(value);
  return Uint8Array.from(decoded, (character) => character.charCodeAt(0));
};

async function hasValidLineSignature(
  rawBody: string,
  signature: string,
  channelSecret: string,
) {
  try {
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(channelSecret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    return await crypto.subtle.verify(
      "HMAC",
      key,
      decodeBase64(signature),
      new TextEncoder().encode(rawBody),
    );
  } catch {
    return false;
  }
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

export async function POST(request: Request) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET?.trim();
  if (!channelSecret)
    return jsonResponse({ ok: false, message: "LINE webhook is not configured" }, 503);

  const signature = request.headers.get("x-line-signature");
  const rawBody = await request.text();
  if (!signature || !(await hasValidLineSignature(rawBody, signature, channelSecret)))
    return jsonResponse({ ok: false, message: "Invalid signature" }, 401);

  let payload: LineWebhookPayload;
  try {
    const parsed: unknown = JSON.parse(rawBody);
    if (!isRecord(parsed)) throw new Error("INVALID_PAYLOAD");
    payload = parsed;
  } catch {
    return jsonResponse({ ok: false, message: "Invalid JSON payload" }, 400);
  }

  if (!Array.isArray(payload.events))
    return jsonResponse({ ok: false, message: "Invalid events payload" }, 400);

  return jsonResponse({ ok: true });
}
