import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendLinePushMessage } from "../lib/line/client";
import {
  bookingCancelledText,
  bookingCreatedText,
  buildBookingAppUrl,
} from "../lib/line/notifications";

const booking = {
  id: "booking-1",
  startAt: "2026-08-17T18:00:00.000Z",
  endAt: "2026-08-17T20:00:00.000Z",
  name: "สมชาย",
  purpose: "ประชุมลูกค้า",
  location: "กรุงเทพฯ",
  status: "confirmed" as const,
  updatedAt: "2026-08-17T00:00:00.000Z",
};

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("LINE push client", () => {
  it("pushes to the configured group without exposing configuration in code", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "server-token");
    vi.stubEnv("LINE_GROUP_ID", "group-id");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendLinePushMessage([{ type: "text", text: "hello" }]),
    ).resolves.toBe(true);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.line.me/v2/bot/message/push");
    expect(JSON.parse(String(init.body))).toEqual({
      to: "group-id",
      messages: [{ type: "text", text: "hello" }],
    });
    expect(new Headers(init.headers).get("Authorization")).toBe(
      "Bearer server-token",
    );
    expect(console.info).toHaveBeenCalledWith("[LINE] push request started");
    expect(console.info).toHaveBeenCalledWith("[LINE] push success status=200");
  });

  it("does not crash or call LINE when the access token is missing", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "");
    vi.stubEnv("LINE_GROUP_ID", "group-id");
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendLinePushMessage([{ type: "text", text: "hello" }]),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warning).toHaveBeenCalledWith(
      expect.stringContaining("LINE_CHANNEL_ACCESS_TOKEN"),
    );
  });

  it("does not crash or call LINE when the group id is missing", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "server-token");
    vi.stubEnv("LINE_GROUP_ID", "");
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      sendLinePushMessage([{ type: "text", text: "hello" }]),
    ).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns false instead of throwing when LINE responds with an error", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "server-token");
    vi.stubEnv("LINE_GROUP_ID", "group-id");
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 503 }),
    );

    await expect(
      sendLinePushMessage([{ type: "text", text: "hello" }]),
    ).resolves.toBe(false);
  });
});

describe("LINE notification text", () => {
  it("uses Bangkok dates and a deep link to the booking date", () => {
    vi.stubEnv("APP_URL", "https://cars.example.com/calendar?source=line");
    const vehicle = { name: "รถส่วนกลาง", license_plate: "กข 1234" };

    expect(buildBookingAppUrl(booking.startAt)).toBe(
      "https://cars.example.com/calendar?source=line&date=2026-08-18",
    );
    expect(bookingCreatedText(booking, vehicle)).toMatch(
      /🚗 มีการจองรถใหม่[\s\S]*👤 สมชาย[\s\S]*📍 ประชุมลูกค้า[\s\S]*🚙 รถส่วนกลาง \/ กข 1234/,
    );
    expect(bookingCancelledText(booking, vehicle)).toMatch(
      /✅ มีช่วงเวลารถว่างเพิ่มแล้ว[\s\S]*การจองช่วงเวลาดังกล่าวถูกยกเลิกแล้ว/,
    );
  });
});
