import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getActiveVehicle: vi.fn(),
  checkBookingConflict: vi.fn(),
  supabaseAdminRequest: vi.fn(),
  notifyManagerVehicleUsageRequestCreated: vi.fn(),
}));

vi.mock("../lib/bookings/queries", () => ({
  getActiveVehicle: mocks.getActiveVehicle,
  checkBookingConflict: mocks.checkBookingConflict,
}));
vi.mock("../lib/bookings/mutations", () => ({ createBooking: vi.fn() }));
vi.mock("../lib/supabase/admin", () => ({
  supabaseAdminRequest: mocks.supabaseAdminRequest,
}));
vi.mock("../lib/line/vehicle-usage-notifications", () => ({
  notifyManagerVehicleUsageRequestCreated: mocks.notifyManagerVehicleUsageRequestCreated,
}));

import { createVehicleUsageRequest } from "../lib/vehicle-usage-requests/mutations";

const input = {
  name: "ผู้ทดสอบ",
  purpose: "ประชุมนอกสถานที่",
  destination: "สำนักงานจังหวัด",
  note: "",
  startAt: "2026-08-27T02:00:00.000Z",
  endAt: "2026-08-27T04:00:00.000Z",
};

const requestRow = {
  id: "request-1",
  vehicle_id: "vehicle-1",
  booker_name: input.name,
  purpose: input.purpose,
  destination: input.destination,
  note: null,
  start_time: input.startAt,
  end_time: input.endAt,
  status: "pending",
  created_at: input.startAt,
  updated_at: input.startAt,
};

describe("vehicle usage request creation", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getActiveVehicle.mockResolvedValue({
      id: "vehicle-1",
      name: "รถยนต์ส่วนกลาง",
      license_plate: "กข 1234",
    });
    mocks.checkBookingConflict.mockResolvedValue(null);
    mocks.notifyManagerVehicleUsageRequestCreated.mockResolvedValue(true);
  });

  it("creates only a pending request and never a vehicle booking", async () => {
    mocks.supabaseAdminRequest.mockResolvedValue(
      new Response(JSON.stringify([requestRow]), { status: 201 }),
    );

    const result = await createVehicleUsageRequest(
      input,
      new Date(input.startAt),
      new Date(input.endAt),
    );

    expect(result).toMatchObject({ ok: true, data: { status: "pending" } });
    expect(mocks.supabaseAdminRequest).toHaveBeenCalledTimes(1);
    expect(mocks.supabaseAdminRequest).toHaveBeenCalledWith(
      "vehicle_usage_requests",
      expect.objectContaining({ method: "POST" }),
    );
    const [, init] = mocks.supabaseAdminRequest.mock.calls[0];
    expect(JSON.parse(init.body)).toMatchObject({
      vehicle_id: "vehicle-1",
      status: "pending",
      booker_name: input.name,
    });
    expect(mocks.supabaseAdminRequest).not.toHaveBeenCalledWith(
      "vehicle_bookings",
      expect.anything(),
    );
    expect(mocks.notifyManagerVehicleUsageRequestCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: requestRow.id, status: "pending" }),
    );
  });

  it("keeps the pending request successful when LINE delivery fails", async () => {
    mocks.supabaseAdminRequest.mockResolvedValue(
      new Response(JSON.stringify([requestRow]), { status: 201 }),
    );
    mocks.notifyManagerVehicleUsageRequestCreated.mockRejectedValue(
      new Error("provider unavailable"),
    );

    const result = await createVehicleUsageRequest(
      input,
      new Date(input.startAt),
      new Date(input.endAt),
    );

    expect(result).toMatchObject({ ok: true, data: { status: "pending" } });
  });

  it("does not send LINE when database insert fails", async () => {
    mocks.supabaseAdminRequest.mockResolvedValue(
      new Response("database error", { status: 500 }),
    );

    const result = await createVehicleUsageRequest(
      input,
      new Date(input.startAt),
      new Date(input.endAt),
    );

    expect(result).toMatchObject({ ok: false, status: 502 });
    expect(mocks.notifyManagerVehicleUsageRequestCreated).not.toHaveBeenCalled();
  });

  it("keeps the existing confirmed-booking conflict rule", async () => {
    mocks.checkBookingConflict.mockResolvedValue({ id: "existing-booking" });

    const result = await createVehicleUsageRequest(
      input,
      new Date(input.startAt),
      new Date(input.endAt),
    );

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(mocks.supabaseAdminRequest).not.toHaveBeenCalled();
  });
});
