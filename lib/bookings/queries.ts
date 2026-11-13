import { supabaseAdminRequest } from "../supabase/admin";
import type { BookingRow, PublicBooking } from "./types";

const publicColumns =
  "id,vehicle_id,booker_name,purpose,destination,note,start_time,end_time,actual_return_at,status,updated_at";
export const toPublicBooking = (row: BookingRow): PublicBooking => ({
  id: row.id,
  startAt: row.start_time,
  endAt: row.end_time,
  actualReturnAt: row.actual_return_at ?? null,
  name: row.booker_name,
  purpose: row.purpose,
  location: row.destination,
  note: row.note,
  status: row.status,
  updatedAt: row.updated_at,
});

export async function getBookingsForRange(start: Date, end: Date) {
  const params = new URLSearchParams({
    select: publicColumns,
    status: "neq.cancelled",
    start_time: `lt.${end.toISOString()}`,
    end_time: `gt.${start.toISOString()}`,
    order: "start_time.asc",
  });
  const response = await supabaseAdminRequest(`vehicle_bookings?${params}`);
  if (!response.ok) {
    const detail = await response.text();
    console.error("Supabase bookings read failed", response.status, detail);
    throw new Error("BOOKINGS_READ_FAILED");
  }
  return ((await response.json()) as BookingRow[]).map(toPublicBooking);
}

export async function getBookingById(id: string) {
  const params = new URLSearchParams({
    select: "*",
    id: `eq.${id}`,
    limit: "1",
  });
  const response = await supabaseAdminRequest(`vehicle_bookings?${params}`);
  if (!response.ok) throw new Error("BOOKING_READ_FAILED");
  return ((await response.json()) as BookingRow[])[0] ?? null;
}

export async function getBookingByCodeHash(codeHash: string) {
  const params = new URLSearchParams({
    select: "*",
    management_code_hash: `eq.${codeHash}`,
    limit: "1",
  });
  const response = await supabaseAdminRequest(`vehicle_bookings?${params}`);
  if (!response.ok) throw new Error("BOOKING_CODE_LOOKUP_FAILED");
  return ((await response.json()) as BookingRow[])[0] ?? null;
}

export async function getBookingBySourceUsageRequestId(requestId: string) {
  const params = new URLSearchParams({
    select: "*",
    source_usage_request_id: `eq.${requestId}`,
    limit: "1",
  });
  const response = await supabaseAdminRequest(`vehicle_bookings?${params}`);
  if (!response.ok) throw new Error("BOOKING_READ_FAILED");
  return ((await response.json()) as BookingRow[])[0] ?? null;
}

export async function bookingCodeExists(codeHash: string) {
  return Boolean(await getBookingByCodeHash(codeHash));
}

export async function checkBookingConflict(
  vehicleId: string,
  start: Date,
  end: Date,
  excludeBookingId?: string,
) {
  const params = new URLSearchParams({
    select: publicColumns,
    vehicle_id: `eq.${vehicleId}`,
    status: "eq.confirmed",
    start_time: `lt.${end.toISOString()}`,
    effective_end_time: `gt.${start.toISOString()}`,
    limit: "1",
  });
  if (excludeBookingId) params.set("id", `neq.${excludeBookingId}`);
  const response = await supabaseAdminRequest(`vehicle_bookings?${params}`);
  if (!response.ok) throw new Error("CONFLICT_CHECK_FAILED");
  const row = ((await response.json()) as BookingRow[])[0];
  return row ? toPublicBooking(row) : null;
}

export async function getActiveVehicle() {
  const response = await supabaseAdminRequest(
    "vehicles?select=id,name,license_plate&is_active=eq.true&limit=1",
  );
  if (!response.ok) throw new Error("VEHICLE_READ_FAILED");
  return (
    (
      (await response.json()) as {
        id: string;
        name: string;
        license_plate: string;
      }[]
    )[0] ?? null
  );
}

export async function getVehicleById(id: string) {
  const params = new URLSearchParams({
    select: "id,name,license_plate",
    id: `eq.${id}`,
    limit: "1",
  });
  const response = await supabaseAdminRequest(`vehicles?${params}`);
  if (!response.ok) throw new Error("VEHICLE_READ_FAILED");
  return (
    (
      (await response.json()) as {
        id: string;
        name: string;
        license_plate: string;
      }[]
    )[0] ?? null
  );
}
