import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { POST } from "../app/api/line/webhook/route";

const channelSecret = "test-line-channel-secret";

const signatureFor = (body: string) =>
  createHmac("sha256", channelSecret).update(body).digest("base64");

const webhookRequest = (body: string, signature = signatureFor(body)) =>
  new Request("https://example.com/api/line/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-line-signature": signature,
    },
    body,
  });

describe("LINE webhook", () => {
  beforeEach(() => {
    vi.stubEnv("LINE_CHANNEL_SECRET", channelSecret);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("accepts a valid signature without logging webhook user IDs", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const body = JSON.stringify({
      events: [
        { type: "follow", source: { type: "user", userId: "Ufollow123" } },
        { type: "message", source: { type: "user", userId: "Umessage456" } },
        { type: "message", source: { type: "group", groupId: "Cgroup" } },
      ],
    });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(info).not.toHaveBeenCalled();
  });

  it("rejects an invalid signature before processing events", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const body = JSON.stringify({
      events: [{ type: "follow", source: { type: "user", userId: "Uignored" } }],
    });

    const response = await POST(webhookRequest(body, "invalid-signature"));

    expect(response.status).toBe(401);
    expect(info).not.toHaveBeenCalled();
  });

  it("accepts LINE webhook verification with an empty events array", async () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const body = JSON.stringify({ events: [] });

    const response = await POST(webhookRequest(body));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(info).not.toHaveBeenCalled();
  });
});
