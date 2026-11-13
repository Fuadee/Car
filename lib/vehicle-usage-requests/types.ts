import type { BookingInput } from "../bookings/types";

export type VehicleUsageRequestStatus = "pending" | "approved" | "rejected" | "cancelled";

// A request deliberately uses the same validated trip details as a booking,
// while remaining a distinct object until an approval creates a real booking.
export type VehicleUsageRequestInput = BookingInput;

export type VehicleUsageRequestRow = {
  id: string;
  vehicle_id: string;
  booker_name: string;
  purpose: string;
  destination: string;
  note: string | null;
  start_time: string;
  end_time: string;
  status: VehicleUsageRequestStatus;
  created_at: string;
  updated_at: string;
  approved_at: string | null;
  rejected_at: string | null;
  approved_by: string | null;
  booking_id: string | null;
  cancelled_at: string | null;
  cancelled_by: string | null;
  vehicles?: { name: string; license_plate: string } | null;
};

export type VehicleUsageRequest = {
  id: string;
  vehicleId: string;
  vehicleName: string;
  vehicleLicensePlate: string;
  name: string;
  purpose: string;
  destination: string;
  note: string | null;
  startAt: string;
  endAt: string;
  status: VehicleUsageRequestStatus;
  createdAt: string;
  updatedAt: string;
  approvedAt: string | null;
  rejectedAt: string | null;
  approvedBy: string | null;
  bookingId: string | null;
  cancelledAt: string | null;
  cancelledBy: string | null;
};

export type VehicleUsageRequestResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; conflict?: unknown };
