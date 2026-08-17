import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  supabaseAdminRequest: vi.fn(),
  bookingCodeExists: vi.fn(),
  checkBookingConflict: vi.fn(),
  getActiveVehicle: vi.fn(),
  getBookingById: vi.fn(),
  getVehicleById: vi.fn(),
  notifyBookingCreated: vi.fn(),
  notifyBookingCancelled: vi.fn(),
}));

vi.mock("../lib/supabase/admin", () => ({
  supabaseAdminRequest: mocks.supabaseAdminRequest,
}));
vi.mock("../lib/bookings/booking-code", () => ({
  createBookingCode: () => "123456",
  hashBookingCode: async () => "code-hash",
  isBookingCode: () => true,
}));
vi.mock("../lib/bookings/queries", () => ({
  bookingCodeExists: mocks.bookingCodeExists,
  checkBookingConflict: mocks.checkBookingConflict,
  getActiveVehicle: mocks.getActiveVehicle,
  getBookingById: mocks.getBookingById,
  getVehicleById: mocks.getVehicleById,
  toPublicBooking: (row: BookingRow) => ({
    id: row.id,
    startAt: row.start_time,
    endAt: row.end_time,
    name: row.booker_name,
    purpose: row.purpose,
    location: row.destination,
    note: row.note,
    status: row.status,
    updatedAt: row.updated_at,
  }),
}));
vi.mock("../lib/line/notifications", () => ({
  notifyBookingCreated: mocks.notifyBookingCreated,
  notifyBookingCancelled: mocks.notifyBookingCancelled,
}));

import { cancelBooking, createBooking } from "../lib/bookings/mutations";

type BookingRow = {
  id: string;
  vehicle_id: string;
  management_code_hash: string;
  booker_name: string;
  purpose: string;
  destination: string;
  note: string | null;
  start_time: string;
  end_time: string;
  status: "confirmed" | "cancelled" | "completed";
  updated_at: string;
};

const row: BookingRow = {
  id: "booking-1",
  vehicle_id: "vehicle-1",
  management_code_hash: "code-hash",
  booker_name: "ผู้ทดสอบ",
  purpose: "ประชุม",
  destination: "สำนักงานใหญ่",
  note: null,
  start_time: "2026-08-18T02:00:00.000Z",
  end_time: "2026-08-18T05:00:00.000Z",
  status: "confirmed",
  updated_at: "2026-08-17T00:00:00.000Z",
};
const vehicle = {
  id: "vehicle-1",
  name: "รถส่วนกลาง",
  license_plate: "กข 1234",
};
const input = {
  name: row.booker_name,
  purpose: row.purpose,
  destination: row.destination,
  startAt: row.start_time,
  endAt: row.end_time,
};
const jsonResponse = (body: unknown, ok = true) =>
  ({
    ok,
    status: ok ? 200 : 500,
    json: async () => body,
    text: async () => "database error",
  }) as Response;

beforeEach(() => {
  vi.spyOn(console, "info").mockImplementation(() => undefined);
  mocks.bookingCodeExists.mockResolvedValue(false);
  mocks.checkBookingConflict.mockResolvedValue(null);
  mocks.getActiveVehicle.mockResolvedValue(vehicle);
  mocks.getBookingById.mockResolvedValue(row);
  mocks.getVehicleById.mockResolvedValue(vehicle);
  mocks.notifyBookingCreated.mockResolvedValue(true);
  mocks.notifyBookingCancelled.mockResolvedValue(true);
});

afterEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("booking notification ordering and reliability", () => {
  it("sends one LINE notification only after a booking insert succeeds", async () => {
    mocks.supabaseAdminRequest.mockResolvedValue(jsonResponse([row]));

    const result = await createBooking(
      input,
      new Date(row.start_time),
      new Date(row.end_time),
    );

    expect(result.ok).toBe(true);
    expect(mocks.notifyBookingCreated).toHaveBeenCalledTimes(1);
    expect(mocks.notifyBookingCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id }),
      vehicle,
    );
  });

  it("does not send LINE when the booking insert fails", async () => {
    mocks.supabaseAdminRequest.mockResolvedValue(jsonResponse([], false));

    const result = await createBooking(
      input,
      new Date(row.start_time),
      new Date(row.end_time),
    );

    expect(result.ok).toBe(false);
    expect(mocks.notifyBookingCreated).not.toHaveBeenCalled();
  });

  it("sends one LINE notification only after cancellation succeeds", async () => {
    const cancelled = { ...row, status: "cancelled" as const };
    mocks.supabaseAdminRequest.mockResolvedValue(jsonResponse([cancelled]));

    const result = await cancelBooking(row.id, { bookingCode: "123456" });

    expect(result.ok).toBe(true);
    expect(mocks.notifyBookingCancelled).toHaveBeenCalledTimes(1);
    expect(mocks.notifyBookingCancelled).toHaveBeenCalledWith(
      expect.objectContaining({ id: row.id, status: "cancelled" }),
      vehicle,
    );
  });

  it("does not send LINE when the cancellation update fails", async () => {
    mocks.supabaseAdminRequest.mockResolvedValue(jsonResponse([], false));

    const result = await cancelBooking(row.id, { bookingCode: "123456" });

    expect(result.ok).toBe(false);
    expect(mocks.notifyBookingCancelled).not.toHaveBeenCalled();
  });

  it("keeps successful database results when LINE rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.supabaseAdminRequest.mockResolvedValue(jsonResponse([row]));
    mocks.notifyBookingCreated.mockRejectedValue(new Error("LINE unavailable"));

    const result = await createBooking(
      input,
      new Date(row.start_time),
      new Date(row.end_time),
    );

    expect(result.ok).toBe(true);
    expect(mocks.notifyBookingCreated).toHaveBeenCalledTimes(1);
  });

  it("keeps a successful cancellation when LINE rejects", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const cancelled = { ...row, status: "cancelled" as const };
    mocks.supabaseAdminRequest.mockResolvedValue(jsonResponse([cancelled]));
    mocks.notifyBookingCancelled.mockRejectedValue(
      new Error("LINE unavailable"),
    );

    const result = await cancelBooking(row.id, { bookingCode: "123456" });

    expect(result.ok).toBe(true);
    expect(mocks.notifyBookingCancelled).toHaveBeenCalledTimes(1);
  });

  it("treats repeated cancellation as idempotent without duplicate LINE", async () => {
    mocks.getBookingById.mockResolvedValue({ ...row, status: "cancelled" });

    const result = await cancelBooking(row.id, { bookingCode: "123456" });

    expect(result.ok).toBe(true);
    expect(mocks.supabaseAdminRequest).not.toHaveBeenCalled();
    expect(mocks.notifyBookingCancelled).not.toHaveBeenCalled();
  });
});
