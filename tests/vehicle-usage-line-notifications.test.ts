import { afterEach, describe, expect, it, vi } from "vitest";

import { notifyManagerVehicleUsageRequestCreated } from "../lib/line/vehicle-usage-notifications";

const request = {
  id: "request-1", vehicleId: "vehicle-1", vehicleName: "รถยนต์ส่วนกลาง", vehicleLicensePlate: "กข 1234",
  name: "สมชาย", purpose: "ตรวจสอบระบบไฟฟ้า", destination: "อ่าวนาง", note: null,
  startAt: "2026-08-27T02:00:00.000Z", endAt: "2026-08-27T10:00:00.000Z", status: "pending" as const,
  createdAt: "2026-08-26T02:00:00.000Z", updatedAt: "2026-08-26T02:00:00.000Z",
  approvedAt: null, rejectedAt: null, approvedBy: null, bookingId: null, cancelledAt: null, cancelledBy: null,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("vehicle usage LINE notification", () => {
  it("pushes a mobile-friendly manager message with the request link", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "server-token");
    vi.stubEnv("MANAGER_LINE_USER_ID", "Umanager");
    vi.stubEnv("APP_BASE_URL", "https://cars.example.com");
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, status: 200 });
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "info").mockImplementation(() => undefined);

    await expect(notifyManagerVehicleUsageRequestCreated(request)).resolves.toBe(true);

    const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    const payload = JSON.parse(String(init.body));
    expect(payload.to).toBe("Umanager");
    expect(payload.messages[0]).toMatchObject({
      type: "flex",
      altText: "มีคำขอใช้รถใหม่ รออนุมัติ",
      contents: {
        footer: { contents: [{ action: { label: "ตรวจสอบคำขอ", uri: "https://cars.example.com/vehicle-usage?request=request-1" } }] },
      },
    });
  });

  it("skips safely when MANAGER_LINE_USER_ID is missing", async () => {
    vi.stubEnv("LINE_CHANNEL_ACCESS_TOKEN", "server-token");
    vi.stubEnv("MANAGER_LINE_USER_ID", "");
    vi.stubEnv("APP_BASE_URL", "https://cars.example.com");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);

    await expect(notifyManagerVehicleUsageRequestCreated(request)).resolves.toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
