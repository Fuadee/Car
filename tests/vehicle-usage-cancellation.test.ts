import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  cancelBookingById: vi.fn(),
  createBooking: vi.fn(),
  supabaseAdminRequest: vi.fn(),
}));

vi.mock("../lib/bookings/mutations", () => ({
  createBooking: mocks.createBooking,
  cancelBookingById: mocks.cancelBookingById,
}));
vi.mock("../lib/bookings/queries", () => ({
  getActiveVehicle: vi.fn(), checkBookingConflict: vi.fn(),
  getBookingBySourceUsageRequestId: vi.fn(), toPublicBooking: vi.fn(),
}));
vi.mock("../lib/supabase/admin", () => ({ supabaseAdminRequest: mocks.supabaseAdminRequest }));

import { cancelVehicleUsageRequest } from "../lib/vehicle-usage-requests/mutations";

const base = {
  id: "request-1", vehicleId: "vehicle-1", vehicleName: "รถยนต์ส่วนกลาง", vehicleLicensePlate: "กข 1234",
  name: "ผู้ทดสอบ", purpose: "ประชุม", destination: "สำนักงาน", note: null,
  startAt: "2026-08-27T02:00:00.000Z", endAt: "2026-08-27T04:00:00.000Z",
  createdAt: "2026-08-26T02:00:00.000Z", updatedAt: "2026-08-26T02:00:00.000Z",
  approvedAt: null, rejectedAt: null, approvedBy: null, bookingId: null, cancelledAt: null, cancelledBy: null,
};
const requestRow = (status: string, values: Record<string, unknown> = {}) => ({
  id: base.id, vehicle_id: base.vehicleId, booker_name: base.name, purpose: base.purpose,
  destination: base.destination, note: null, start_time: base.startAt, end_time: base.endAt,
  status, created_at: base.createdAt, updated_at: base.updatedAt, approved_at: null,
  rejected_at: null, approved_by: null, booking_id: base.bookingId, cancelled_at: base.updatedAt,
  cancelled_by: "หัวหน้า", ...values,
});

describe("manager vehicle usage cancellation", () => {
  beforeEach(() => vi.resetAllMocks());

  it("cancels a pending request without creating or cancelling a booking", async () => {
    mocks.supabaseAdminRequest.mockResolvedValue(new Response(JSON.stringify([requestRow("cancelled")]), { status: 200 }));
    const result = await cancelVehicleUsageRequest({ ...base, status: "pending" as const });
    expect(result).toMatchObject({ ok: true, data: { status: "cancelled", cancelledBy: "หัวหน้า" } });
    expect(mocks.cancelBookingById).not.toHaveBeenCalled();
    expect(mocks.createBooking).not.toHaveBeenCalled();
  });

  it("cancels the linked confirmed booking before marking an approved request cancelled", async () => {
    mocks.cancelBookingById.mockResolvedValue({ ok: true, data: { id: "booking-1", status: "cancelled" } });
    mocks.supabaseAdminRequest.mockResolvedValue(new Response(JSON.stringify([requestRow("cancelled", { booking_id: "booking-1" })]), { status: 200 }));
    const result = await cancelVehicleUsageRequest({ ...base, status: "approved" as const, bookingId: "booking-1" });
    expect(result).toMatchObject({ ok: true, data: { status: "cancelled" } });
    expect(mocks.cancelBookingById).toHaveBeenCalledWith("booking-1");
  });

  it("refuses rejected requests without side effects", async () => {
    const result = await cancelVehicleUsageRequest({ ...base, status: "rejected" as const });
    expect(result).toMatchObject({ ok: false, status: 409 });
    expect(mocks.cancelBookingById).not.toHaveBeenCalled();
    expect(mocks.supabaseAdminRequest).not.toHaveBeenCalled();
  });

  it("treats an already cancelled request as idempotent", async () => {
    const cancelled = { ...base, status: "cancelled" as const, cancelledAt: base.updatedAt, cancelledBy: "หัวหน้า" };
    const result = await cancelVehicleUsageRequest(cancelled);
    expect(result).toMatchObject({ ok: true, alreadyCancelled: true });
    expect(mocks.cancelBookingById).not.toHaveBeenCalled();
    expect(mocks.supabaseAdminRequest).not.toHaveBeenCalled();
  });
});
