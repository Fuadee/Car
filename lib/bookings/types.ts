export type BookingStatus = "confirmed" | "cancelled" | "completed";

export type BookingRow = {
  id: string;
  vehicle_id: string;
  booking_reference: string;
  management_code_hash: string;
  booker_name: string;
  purpose: string;
  destination: string;
  note: string | null;
  start_time: string;
  end_time: string;
  actual_return_at?: string | null;
  status: BookingStatus;
  created_at: string;
  updated_at: string;
  cancelled_at: string | null;
  source_usage_request_id?: string | null;
};

export type PublicBooking = {
  id: string;
  startAt: string;
  endAt: string;
  actualReturnAt?: string | null;
  name: string;
  purpose: string;
  location: string;
  note?: string | null;
  status: BookingStatus;
  updatedAt: string;
};

export type BookingInput = {
  name: string;
  purpose: string;
  destination: string;
  note?: string;
  startAt: string;
  endAt: string;
};

export type ManageCredentials = { bookingCode: string };
export type UpdateBookingInput = BookingInput &
  ManageCredentials & { updatedAt: string };
export type MutationResult<T> =
  | { ok: true; data: T }
  | { ok: false; status: number; message: string; conflict?: PublicBooking };
