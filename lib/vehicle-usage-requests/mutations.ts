import { cancelBookingById, createBooking } from "../bookings/mutations";
import {
  checkBookingConflict,
  getActiveVehicle,
  getBookingBySourceUsageRequestId,
  toPublicBooking,
} from "../bookings/queries";
import { supabaseAdminRequest } from "../supabase/admin";
import type { BookingInput, PublicBooking } from "../bookings/types";
import { getVehicleUsageRequestById, toVehicleUsageRequest } from "./queries";
import { notifyManagerVehicleUsageRequestCreated } from "../line/vehicle-usage-notifications";
import type {
  VehicleUsageRequest,
  VehicleUsageRequestResult,
  VehicleUsageRequestRow,
} from "./types";

export async function createVehicleUsageRequest(
  input: BookingInput,
  start: Date,
  end: Date,
): Promise<VehicleUsageRequestResult<VehicleUsageRequest>> {
  const vehicle = await getActiveVehicle();
  if (!vehicle)
    return { ok: false, status: 409, message: "ไม่พบรถที่เปิดให้บริการ" };

  // Pending requests do not block each other, but an already confirmed booking
  // remains unavailable just as it was in the direct-booking flow.
  const conflict = await checkBookingConflict(vehicle.id, start, end);
  if (conflict)
    return {
      ok: false,
      status: 409,
      message: "ช่วงเวลานี้มีผู้จองรถแล้ว กรุณาเลือกช่วงเวลาใหม่",
      conflict: conflict as PublicBooking,
    };

  const response = await supabaseAdminRequest("vehicle_usage_requests", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      vehicle_id: vehicle.id,
      booker_name: input.name,
      purpose: input.purpose,
      destination: input.destination,
      note: input.note || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      status: "pending",
    }),
  });
  if (!response.ok)
    return {
      ok: false,
      status: 502,
      message: "ไม่สามารถส่งคำขอใช้รถได้ กรุณาลองใหม่",
    };
  const row = ((await response.json()) as VehicleUsageRequestRow[])[0];
  if (!row)
    return {
      ok: false,
      status: 502,
      message: "ไม่สามารถยืนยันผลการส่งคำขอได้",
    };
  const usageRequest = {
    ...toVehicleUsageRequest(row),
    vehicleName: vehicle.name,
    vehicleLicensePlate: vehicle.license_plate,
  };
  try {
    const delivered = await notifyManagerVehicleUsageRequestCreated(usageRequest);
    console.info("LINE manager notification completed", {
      requestId: usageRequest.id,
      delivered,
    });
  } catch (reason) {
    const name = reason instanceof Error ? reason.name : "UnknownError";
    console.error("LINE manager notification failed", {
      requestId: usageRequest.id,
      error: name,
    });
  }
  return { ok: true, data: usageRequest };
}

const requestInput = (request: VehicleUsageRequest) => ({
  name: request.name,
  purpose: request.purpose,
  destination: request.destination,
  note: request.note ?? "",
  startAt: request.startAt,
  endAt: request.endAt,
});

const approveRequestRecord = async (request: VehicleUsageRequest, bookingId: string) => {
  const params = new URLSearchParams({
    id: `eq.${request.id}`,
    status: "eq.pending",
    booking_id: "is.null",
  });
  const response = await supabaseAdminRequest(`vehicle_usage_requests?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "approved",
      approved_at: new Date().toISOString(),
      rejected_at: null,
      approved_by: "หัวหน้า",
      booking_id: bookingId,
    }),
  });
  if (!response.ok) throw new Error("REQUEST_APPROVAL_UPDATE_FAILED");
  const row = ((await response.json()) as VehicleUsageRequestRow[])[0];
  if (row) return toVehicleUsageRequest(row);
  const current = await getVehicleUsageRequestById(request.id);
  if (current?.status === "approved" && current.bookingId === bookingId)
    return current;
  throw new Error("REQUEST_APPROVAL_RACE");
};

export async function approveVehicleUsageRequest(request: VehicleUsageRequest) {
  if (request.status !== "pending")
    return { ok: false as const, status: 409, message: "คำขอนี้ถูกดำเนินการแล้ว" };

  const input = requestInput(request);
  const start = new Date(input.startAt);
  const end = new Date(input.endAt);
  const existingBooking = await getBookingBySourceUsageRequestId(request.id);
  const bookingResult = existingBooking
    ? { ok: true as const, data: { booking: toPublicBooking(existingBooking) } }
    : await createBooking(input, start, end, {
        sourceUsageRequestId: request.id,
      });
  if (!bookingResult.ok) return bookingResult;
  try {
    const approved = await approveRequestRecord(request, bookingResult.data.booking.id);
    return { ok: true as const, data: { request: approved, booking: bookingResult.data.booking } };
  } catch {
    // The unique source_usage_request_id on vehicle_bookings means a retry is
    // safe: it recovers the same booking rather than creating another one.
    return {
      ok: false as const,
      status: 502,
      message: "สร้างการจองแล้ว แต่บันทึกสถานะอนุมัติไม่สำเร็จ กรุณาลองยืนยันอีกครั้ง",
    };
  }
}

export async function rejectVehicleUsageRequest(request: VehicleUsageRequest) {
  if (request.status !== "pending")
    return { ok: false as const, status: 409, message: "คำขอนี้ถูกดำเนินการแล้ว" };
  const params = new URLSearchParams({ id: `eq.${request.id}`, status: "eq.pending" });
  const response = await supabaseAdminRequest(`vehicle_usage_requests?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "rejected",
      rejected_at: new Date().toISOString(),
      approved_at: null,
      approved_by: null,
      booking_id: null,
    }),
  });
  if (!response.ok)
    return { ok: false as const, status: 502, message: "ไม่สามารถบันทึกการไม่อนุมัติได้" };
  const row = ((await response.json()) as VehicleUsageRequestRow[])[0];
  if (row) return { ok: true as const, data: toVehicleUsageRequest(row) };
  return { ok: false as const, status: 409, message: "คำขอนี้ถูกดำเนินการแล้ว" };
}

const cancelRequestRecord = async (request: VehicleUsageRequest) => {
  const params = new URLSearchParams({ id: `eq.${request.id}`, status: `eq.${request.status}` });
  const response = await supabaseAdminRequest(`vehicle_usage_requests?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancelled_by: "หัวหน้า",
    }),
  });
  if (!response.ok) throw new Error("REQUEST_CANCELLATION_UPDATE_FAILED");
  const row = ((await response.json()) as VehicleUsageRequestRow[])[0];
  if (row) return toVehicleUsageRequest(row);
  const current = await getVehicleUsageRequestById(request.id);
  if (current?.status === "cancelled") return current;
  throw new Error("REQUEST_CANCELLATION_RACE");
};

export async function cancelVehicleUsageRequest(request: VehicleUsageRequest) {
  if (request.status === "cancelled")
    return { ok: true as const, data: request, alreadyCancelled: true };
  if (request.status === "rejected")
    return { ok: false as const, status: 409, message: "รายการที่ไม่อนุมัติแล้วไม่สามารถยกเลิกได้" };
  if (request.status === "pending") {
    try {
      return { ok: true as const, data: await cancelRequestRecord(request), alreadyCancelled: false };
    } catch {
      return { ok: false as const, status: 502, message: "ไม่สามารถยกเลิกคำขอได้" };
    }
  }
  if (!request.bookingId)
    return { ok: false as const, status: 409, message: "ไม่พบรายการจองที่เชื่อมกับคำขอนี้" };
  const bookingResult = await cancelBookingById(request.bookingId);
  if (!bookingResult.ok) return bookingResult;
  try {
    return { ok: true as const, data: await cancelRequestRecord(request), alreadyCancelled: false };
  } catch {
    // Booking cancellation is idempotent. A retry will see the cancelled
    // booking and safely finish the request state without another LINE send.
    return {
      ok: false as const,
      status: 502,
      message: "ยกเลิกการจองแล้ว แต่บันทึกสถานะคำขอไม่สำเร็จ กรุณาลองยืนยันอีกครั้ง",
    };
  }
}
