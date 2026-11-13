import type { PublicBooking } from "../bookings/types";

export type EarlyReturnRequest = {
  id: string;
  booking_id: string;
  requested_at: string;
  status: "pending" | "confirmed" | "rejected";
  confirmed_at: string | null;
  rejected_at: string | null;
  reviewed_by: string | null;
  created_at: string;
  updated_at: string;
  booking?: PublicBooking;
  vehicleName?: string;
};
