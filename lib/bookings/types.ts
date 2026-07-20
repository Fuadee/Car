export type BookingStatus = "confirmed" | "cancelled" | "completed";

export type BookingRow = {
  id: string;
  vehicle_id: string;
  booking_reference: string;
  management_code_hash: string;
  booker_name: string;
  phone: string | null;
  purpose: string;
  destination: string;
  note: string | null;
  start_time: string;
  end_time: string;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
};

export type PublicBooking = {
  id: string;
  startAt: string;
  endAt: string;
  name: string;
  purpose: string;
  location: string;
  status: BookingStatus;
  updatedAt: string;
};

export type BookingInput = {
  name: string;
  phone?: string;
  purpose: string;
  destination: string;
  note?: string;
  startAt: string;
  endAt: string;
};

export type ManageCredentials = { reference: string; managementCode: string };
export type UpdateBookingInput = BookingInput &
  ManageCredentials & { updatedAt: string };
export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; conflict?: PublicBooking };
