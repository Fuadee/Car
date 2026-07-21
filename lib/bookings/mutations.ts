import { supabaseAdminRequest } from "../supabase/admin";
import {
  bookingCodeExists,
  checkBookingConflict,
  getActiveVehicle,
  getBookingById,
  toPublicBooking,
} from "./queries";
import {
  createBookingCode,
  hashBookingCode,
  isBookingCode,
} from "./booking-code";
import type {
  BookingInput,
  BookingRow,
  ManageCredentials,
  MutationResult,
  PublicBooking,
  UpdateBookingInput,
} from "./types";

const isOverlapError = (detail: string) =>
  detail.includes("confirmed_booking_no_overlap") || detail.includes("23P01");
const isBookingCodeConflict = (detail: string) =>
  detail.includes("vehicle_bookings_management_code_hash_key") ||
  detail.includes("management_code_hash");

export async function createBooking(
  input: BookingInput,
  start: Date,
  end: Date,
): Promise<
  MutationResult<{
    booking: PublicBooking;
    bookingCode: string;
  }>
> {
  const vehicle = await getActiveVehicle();
  if (!vehicle)
    return { ok: false, status: 409, message: "ไม่พบรถที่เปิดให้บริการ" };
  const conflict = await checkBookingConflict(vehicle.id, start, end);
  if (conflict)
    return {
      ok: false,
      status: 409,
      message: "ช่วงเวลานี้มีผู้จองรถแล้ว กรุณาเลือกช่วงเวลาใหม่",
      conflict,
    };
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const bookingCode = createBookingCode();
    const managementCodeHash = await hashBookingCode(bookingCode);
    if (await bookingCodeExists(managementCodeHash)) continue;
    const response = await supabaseAdminRequest("vehicle_bookings", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        vehicle_id: vehicle.id,
        booking_reference: `CAR-${start.toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`,
        management_code_hash: managementCodeHash,
        booker_name: input.name,
        purpose: input.purpose,
        destination: input.destination,
        note: input.note || null,
        start_time: start.toISOString(),
        end_time: end.toISOString(),
        status: "confirmed",
      }),
    });
    if (response.ok) {
      const row = ((await response.json()) as BookingRow[])[0];
      return { ok: true, data: { booking: toPublicBooking(row), bookingCode } };
    }
    const detail = await response.text();
    if (isBookingCodeConflict(detail)) continue;
    return {
      ok: false,
      status: 409,
      message: isOverlapError(detail)
        ? "ช่วงเวลานี้มีผู้จองรถแล้ว กรุณาเลือกช่วงเวลาใหม่"
        : "ไม่สามารถบันทึกการจองได้",
    };
  }
  return {
    ok: false,
    status: 503,
    message: "ไม่สามารถสร้างรหัสการจองได้ กรุณาลองใหม่อีกครั้ง",
  };
}

async function authorizedBooking(id: string, credentials: ManageCredentials) {
  if (!isBookingCode(credentials.bookingCode)) return null;
  const row = await getBookingById(id);
  return row &&
    row.management_code_hash === (await hashBookingCode(credentials.bookingCode))
    ? row
    : null;
}

export async function updateBooking(
  id: string,
  input: UpdateBookingInput,
  start: Date,
  end: Date,
): Promise<MutationResult<PublicBooking>> {
  const current = await authorizedBooking(id, input);
  if (!current)
    return {
      ok: false,
      status: 403,
      message: "ไม่พบการจองจากรหัสนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง",
    };
  if (current.updated_at !== input.updatedAt)
    return {
      ok: false,
      status: 409,
      message: "รายการนี้ถูกแก้ไขจากอุปกรณ์อื่น กรุณาโหลดข้อมูลล่าสุด",
    };
  const conflict = await checkBookingConflict(
    current.vehicle_id,
    start,
    end,
    id,
  );
  if (conflict)
    return {
      ok: false,
      status: 409,
      message: "ช่วงเวลานี้มีผู้จองรถแล้ว กรุณาเลือกช่วงเวลาใหม่",
      conflict,
    };
  const params = new URLSearchParams({
    id: `eq.${id}`,
    updated_at: `eq.${input.updatedAt}`,
  });
  const response = await supabaseAdminRequest(`vehicle_bookings?${params}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      booker_name: input.name,
      purpose: input.purpose,
      destination: input.destination,
      note: input.note || null,
      start_time: start.toISOString(),
      end_time: end.toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    return {
      ok: false,
      status: 409,
      message: isOverlapError(detail)
        ? "ช่วงเวลานี้มีผู้จองรถแล้ว กรุณาเลือกช่วงเวลาใหม่"
        : "แก้ไขการจองไม่สำเร็จ",
    };
  }
  const row = ((await response.json()) as BookingRow[])[0];
  return row
    ? { ok: true, data: toPublicBooking(row) }
    : {
        ok: false,
        status: 409,
        message: "รายการนี้ถูกแก้ไขจากอุปกรณ์อื่น กรุณาโหลดข้อมูลล่าสุด",
      };
}

export async function cancelBooking(
  id: string,
  credentials: ManageCredentials,
): Promise<MutationResult<PublicBooking>> {
  const current = await authorizedBooking(id, credentials);
  if (!current)
    return {
      ok: false,
      status: 403,
      message: "ไม่พบการจองจากรหัสนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง",
    };
  const response = await supabaseAdminRequest(`vehicle_bookings?id=eq.${id}`, {
    method: "PATCH",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }),
  });
  if (!response.ok)
    return { ok: false, status: 502, message: "ยกเลิกการจองไม่สำเร็จ" };
  return {
    ok: true,
    data: toPublicBooking(((await response.json()) as BookingRow[])[0]),
  };
}
