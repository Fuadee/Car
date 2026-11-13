import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createBooking: vi.fn(),
  getActiveVehicle: vi.fn(),
  getBookingBySourceUsageRequestId: vi.fn(),
  checkBookingConflict: vi.fn(),
  getVehicleUsageRequestById: vi.fn(),
  notifyManagerVehicleUsageRequestCreated: vi.fn(),
  supabaseAdminRequest: vi.fn(),
}));

vi.mock("../lib/bookings/mutations", () => ({ createBooking: mocks.createBooking }));
vi.mock("../lib/bookings/queries", () => ({
  getActiveVehicle: mocks.getActiveVehicle,
  checkBookingConflict: mocks.checkBookingConflict,
  getBookingBySourceUsageRequestId: mocks.getBookingBySourceUsageRequestId,
}));
vi.mock("../lib/supabase/admin", () => ({ supabaseAdminRequest: mocks.supabaseAdminRequest }));
vi.mock("../lib/line/vehicle-usage-notifications", () => ({
  notifyManagerVehicleUsageRequestCreated: mocks.notifyManagerVehicleUsageRequestCreated,
}));
vi.mock("../lib/vehicle-usage-requests/queries", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../lib/vehicle-usage-requests/queries")>()),
  getVehicleUsageRequestById: mocks.getVehicleUsageRequestById,
}));

import { approveVehicleUsageRequest, rejectVehicleUsageRequest } from "../lib/vehicle-usage-requests/mutations";
import { validateBookingInput } from "../lib/bookings/validators";

const pending = {
  id: "request-1", vehicleId: "vehicle-1", vehicleName: "รถยนต์ส่วนกลาง", vehicleLicensePlate: "กข 1234",
  name: "ผู้ทดสอบ", purpose: "ประชุม", destination: "สำนักงาน", note: null,
  startAt: "2026-08-27T02:00:00.000Z", endAt: "2026-08-27T04:00:00.000Z", status: "pending" as const,
  createdAt: "2026-08-26T02:00:00.000Z", updatedAt: "2026-08-26T02:00:00.000Z",
  approvedAt: null, rejectedAt: null, approvedBy: null, bookingId: null, cancelledAt: null, cancelledBy: null,
};
const row = (overrides: Record<string, unknown> = {}) => ({
  id: pending.id, vehicle_id: pending.vehicleId, booker_name: pending.name, purpose: pending.purpose,
  destination: pending.destination, note: null, start_time: pending.startAt, end_time: pending.endAt,
  status: "approved", created_at: pending.createdAt, updated_at: pending.updatedAt,
  approved_at: pending.updatedAt, rejected_at: null, approved_by: "หัวหน้า", booking_id: "booking-1", ...overrides,
});

describe("vehicle usage approval", () => {
  beforeEach(() => { vi.resetAllMocks(); vi.useRealTimers(); });

  it("keeps normal request creation from accepting a past start time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-27T03:00:00.000Z"));
    const pastInput = { ...pending, startAt: "2026-08-27T02:00:00.000Z", endAt: "2026-08-27T04:00:00.000Z" };

    expect(validateBookingInput(pastInput)).toMatchObject({
      ok: false,
      message: "ไม่สามารถจองวันเวลาที่ผ่านมาแล้ว",
    });
    expect(validateBookingInput(pastInput, { allowPastStart: true })).toMatchObject({ ok: true });
  });

  it("approves a pending request through the existing booking engine and links the booking", async () => {
    mocks.createBooking.mockResolvedValue({ ok: true, data: { booking: { id: "booking-1" }, bookingCode: "123456" } });
    mocks.supabaseAdminRequest.mockResolvedValue(new Response(JSON.stringify([row()]), { status: 200 }));
    const result = await approveVehicleUsageRequest(pending);
    expect(result).toMatchObject({ ok: true, data: { request: { status: "approved", bookingId: "booking-1" } } });
    expect(mocks.createBooking).toHaveBeenCalledWith(expect.objectContaining({ name: pending.name }), expect.any(Date), expect.any(Date), { sourceUsageRequestId: pending.id });
    expect(mocks.supabaseAdminRequest).toHaveBeenCalledWith(expect.stringContaining("vehicle_usage_requests?"), expect.objectContaining({ method: "PATCH" }));
    expect(mocks.notifyManagerVehicleUsageRequestCreated).not.toHaveBeenCalled();
  });

  it("keeps a request pending and creates no booking when approval finds a conflict", async () => {
    mocks.createBooking.mockResolvedValue({ ok: false, status: 409, message: "ช่วงเวลานี้มีผู้จองรถแล้ว" });
    const result = await approveVehicleUsageRequest(pending);
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(mocks.supabaseAdminRequest).not.toHaveBeenCalled();
  });

  it.each([
    ["before", "2026-08-27T01:30:00.000Z"],
    ["during", "2026-08-27T03:00:00.000Z"],
    ["after", "2026-08-27T12:00:00.000Z"],
  ])("preserves the requested time range when approval occurs %s usage", async (_timing, approvalAt) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(approvalAt));
    mocks.createBooking.mockResolvedValue({ ok: true, data: { booking: { id: "booking-1", startAt: pending.startAt, endAt: pending.endAt }, bookingCode: null } });
    mocks.supabaseAdminRequest.mockResolvedValue(new Response(JSON.stringify([row({ approved_at: approvalAt })]), { status: 200 }));

    const result = await approveVehicleUsageRequest(pending);

    expect(result).toMatchObject({ ok: true, data: { booking: { startAt: pending.startAt, endAt: pending.endAt } } });
    expect(mocks.createBooking).toHaveBeenCalledWith(
      expect.objectContaining({ startAt: pending.startAt, endAt: pending.endAt }),
      new Date(pending.startAt),
      new Date(pending.endAt),
      { sourceUsageRequestId: pending.id },
    );
    const [, init] = mocks.supabaseAdminRequest.mock.calls[0];
    expect(JSON.parse(init.body).approved_at).toBe(approvalAt);
  });

  it("keeps a historical request pending when its original range conflicts", async () => {
    const historical = { ...pending, startAt: "2026-08-27T02:00:00.000Z", endAt: "2026-08-27T10:00:00.000Z" };
    mocks.createBooking.mockResolvedValue({ ok: false, status: 409, message: "ช่วงเวลานี้มีผู้จองรถแล้ว" });

    const result = await approveVehicleUsageRequest(historical);

    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(mocks.supabaseAdminRequest).not.toHaveBeenCalled();
  });

  it("allows an idempotent retry to link the single booking returned by createBooking", async () => {
    mocks.createBooking.mockResolvedValue({ ok: true, data: { booking: { id: "booking-1" }, bookingCode: null } });
    mocks.supabaseAdminRequest.mockResolvedValue(new Response(JSON.stringify([row()]), { status: 200 }));
    const result = await approveVehicleUsageRequest(pending);
    expect(result).toMatchObject({ ok: true, data: { booking: { id: "booking-1" } } });
    expect(mocks.createBooking).toHaveBeenCalledTimes(1);
  });

  it("rejects without calling the booking engine", async () => {
    mocks.supabaseAdminRequest.mockResolvedValue(new Response(JSON.stringify([row({ status: "rejected", approved_at: null, rejected_at: pending.updatedAt, approved_by: null, booking_id: null })]), { status: 200 }));
    const result = await rejectVehicleUsageRequest(pending);
    expect(result).toMatchObject({ ok: true, data: { status: "rejected", bookingId: null } });
    expect(mocks.createBooking).not.toHaveBeenCalled();
    expect(mocks.notifyManagerVehicleUsageRequestCreated).not.toHaveBeenCalled();
  });
});
