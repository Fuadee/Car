import { supabaseAdminRequest } from "../supabase/admin";
import type { VehicleUsageRequest, VehicleUsageRequestRow } from "./types";

const requestColumns =
  "id,vehicle_id,booker_name,purpose,destination,note,start_time,end_time,status,created_at,updated_at,approved_at,rejected_at,approved_by,booking_id,cancelled_at,cancelled_by,vehicles(name,license_plate)";

export const toVehicleUsageRequest = (
  row: VehicleUsageRequestRow,
): VehicleUsageRequest => ({
  id: row.id,
  vehicleId: row.vehicle_id,
  vehicleName: row.vehicles?.name ?? "รถยนต์ส่วนกลาง",
  vehicleLicensePlate: row.vehicles?.license_plate ?? "ระบุภายหลัง",
  name: row.booker_name,
  purpose: row.purpose,
  destination: row.destination,
  note: row.note,
  startAt: row.start_time,
  endAt: row.end_time,
  status: row.status,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  approvedAt: row.approved_at,
  rejectedAt: row.rejected_at,
  approvedBy: row.approved_by,
  bookingId: row.booking_id,
  cancelledAt: row.cancelled_at,
  cancelledBy: row.cancelled_by,
});

export async function getPendingVehicleUsageRequests() {
  const params = new URLSearchParams({
    select: requestColumns,
    status: "eq.pending",
    order: "created_at.desc",
  });
  const response = await supabaseAdminRequest(
    `vehicle_usage_requests?${params}`,
  );
  if (!response.ok) throw new Error("USAGE_REQUESTS_READ_FAILED");
  return ((await response.json()) as VehicleUsageRequestRow[]).map(
    toVehicleUsageRequest,
  );
}

export async function getVehicleUsageRequestById(id: string) {
  const params = new URLSearchParams({ select: requestColumns, id: `eq.${id}`, limit: "1" });
  const response = await supabaseAdminRequest(`vehicle_usage_requests?${params}`);
  if (!response.ok) throw new Error("USAGE_REQUEST_READ_FAILED");
  const row = ((await response.json()) as VehicleUsageRequestRow[])[0];
  return row ? toVehicleUsageRequest(row) : null;
}

export async function getVehicleUsageRequestHistory() {
  const params = new URLSearchParams({
    select: requestColumns,
    status: "in.(approved,rejected,cancelled)",
    order: "updated_at.desc",
  });
  const response = await supabaseAdminRequest(`vehicle_usage_requests?${params}`);
  if (!response.ok) throw new Error("USAGE_REQUESTS_READ_FAILED");
  return ((await response.json()) as VehicleUsageRequestRow[]).map(
    toVehicleUsageRequest,
  );
}

export async function getPendingVehicleUsageRequestCount() {
  const response = await supabaseAdminRequest(
    "vehicle_usage_requests?select=id&status=eq.pending",
    { headers: { Prefer: "count=exact" } },
  );
  if (!response.ok) throw new Error("USAGE_REQUESTS_COUNT_FAILED");
  const range = response.headers.get("content-range");
  const total = range?.split("/")[1];
  return total && total !== "*" ? Number(total) : 0;
}
