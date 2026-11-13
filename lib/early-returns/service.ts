import "server-only";
import { supabaseAdminRequest } from "../supabase/admin";
import { getBookingById, getVehicleById, toPublicBooking } from "../bookings/queries";
import { notifyManagerEarlyReturn } from "../line/early-return-notifications";
import type { EarlyReturnRequest } from "./types";

export async function listEarlyReturns() {
  const response = await supabaseAdminRequest("vehicle_early_return_requests?select=*&order=requested_at.desc");
  if (!response.ok) throw new Error("RETURN_READ_FAILED");
  const rows = await response.json() as EarlyReturnRequest[];
  const bookings = new Map(await Promise.all([...new Set(rows.map(r => r.booking_id))].map(async id => [id, await getBookingById(id)] as const)));
  const vehicleIds = [...new Set([...bookings.values()].flatMap(b => b ? [b.vehicle_id] : []))];
  const vehicles = new Map(await Promise.all(vehicleIds.map(async id => [id, await getVehicleById(id)] as const)));
  return rows.map(r => {
    const b = bookings.get(r.booking_id);
    return { ...r, booking: b ? toPublicBooking(b) : undefined, vehicleName: b ? vehicles.get(b.vehicle_id)?.name : undefined };
  });
}

export async function requestEarlyReturn(bookingId: string) {
  const response = await supabaseAdminRequest("rpc/request_vehicle_early_return", {
    method: "POST", body: JSON.stringify({ p_booking_id: bookingId }),
  });
  if (!response.ok) return { ok: false as const, status: response.status >= 500 ? 502 : 409, message: "ไม่สามารถแจ้งคืนได้ กรุณาตรวจสอบสถานะการจองแล้วลองใหม่" };
  const result = await response.json() as { request: EarlyReturnRequest; created: boolean };
  if (result.created) {
    try {
      const booking = await getBookingById(bookingId);
      if (booking) await notifyManagerEarlyReturn(result.request, toPublicBooking(booking));
    } catch { console.error("LINE early return notification failed"); }
  }
  return { ok: true as const, data: result.request };
}

export async function reviewEarlyReturn(id: string, confirm: boolean) {
  const response = await supabaseAdminRequest("rpc/review_vehicle_early_return", {
    method: "POST", body: JSON.stringify({ p_request_id: id, p_confirm: confirm }),
  });
  if (!response.ok) return { ok: false as const, status: response.status >= 500 ? 502 : 409, message: "ไม่สามารถดำเนินการได้ รายการอาจถูกดำเนินการหรือยกเลิกแล้ว" };
  return { ok: true as const, data: await response.json() as EarlyReturnRequest };
}
