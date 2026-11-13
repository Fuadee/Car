export type LineMessage = Record<string, unknown> & { type: string };

const LINE_PUSH_ENDPOINT = "https://api.line.me/v2/bot/message/push";

const errorName = (reason: unknown) =>
  reason instanceof Error ? reason.name : "UnknownError";

/**
 * Sends a best-effort push through the existing LINE Messaging API channel.
 * This helper never throws so a notification failure cannot roll back a
 * completed booking mutation.
 */
export async function sendLinePushMessage(
  messages: readonly LineMessage[],
  recipientId?: string,
): Promise<boolean> {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN?.trim();
  const recipient = recipientId ?? process.env.LINE_GROUP_ID?.trim();

  if (!accessToken) {
    console.warn(
      "LINE push skipped: LINE_CHANNEL_ACCESS_TOKEN is not configured",
    );
    return false;
  }
  if (!recipient) {
    console.warn("LINE push skipped: recipient is not configured");
    return false;
  }
  if (!messages.length) {
    console.warn("LINE push skipped: no messages were provided");
    return false;
  }

  try {
    console.info("[LINE] push request started");
    const response = await fetch(LINE_PUSH_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ to: recipient, messages }),
    });
    if (!response.ok) {
      // Avoid logging the response body so upstream details cannot leak.
      console.error(`[LINE] push failed status=${response.status}`);
      return false;
    }
    console.info(`[LINE] push success status=${response.status}`);
    return true;
  } catch (reason) {
    console.error("[LINE] push failed error=network_or_runtime", {
      error: errorName(reason),
    });
    return false;
  }
}
