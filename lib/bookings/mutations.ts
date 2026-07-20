import { supabaseAdminRequest } from "../supabase/admin";
import {
  checkBookingConflict,
  getActiveVehicle,
  getBookingById,
  toPublicBooking,
} from "./queries";
import type {
  BookingInput,
  BookingRow,
  ManageCredentials,
  MutationResult,
  PublicBooking,
  UpdateBookingInput,
} from "./types";

async function codeHash(code: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("MANAGEMENT_SECRET_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

const isOverlapError = (detail: string) =>
  detail.includes("confirmed_booking_no_overlap") || detail.includes("23P01");

export async function createBooking(
  input: BookingInput,
  start: Date,
  end: Date,
): Promise<
  MutationResult<{
    booking: PublicBooking;
    reference: string;
    managementCode: string;
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
  const reference = `CAR-${start.toISOString().slice(0, 10).replaceAll("-", "")}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
  const managementCode = String(
    (crypto.getRandomValues(new Uint32Array(1))[0] % 900000) + 100000,
  );
  const record = {
    vehicle_id: vehicle.id,
    booking_reference: reference,
    management_code_hash: await codeHash(managementCode),
    booker_name: input.name,
    phone: input.phone || null,
    purpose: input.purpose,
    destination: input.destination,
    note: input.note || null,
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    status: "confirmed",
  };
  const response = await supabaseAdminRequest("vehicle_bookings", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify(record),
  });
  if (!response.ok) {
    const detail = await response.text();
    return {
      ok: false,
      status: 409,
      message: isOverlapError(detail)
        ? "ช่วงเวลานี้มีผู้จองรถแล้ว กรุณาเลือกช่วงเวลาใหม่"
        : "ไม่สามารถบันทึกการจองได้",
    };
  }
  const row = ((await response.json()) as BookingRow[])[0];
  return {
    ok: true,
    data: { booking: toPublicBooking(row), reference, managementCode },
  };
}

async function authorizedBooking(id: string, credentials: ManageCredentials) {
  const row = await getBookingById(id);
  return row &&
    row.booking_reference === credentials.reference &&
    row.management_code_hash === (await codeHash(credentials.managementCode))
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
      message: "เลขอ้างอิงหรือรหัสจัดการไม่ถูกต้อง",
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
      phone: input.phone || null,
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
      message: "เลขอ้างอิงหรือรหัสจัดการไม่ถูกต้อง",
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
