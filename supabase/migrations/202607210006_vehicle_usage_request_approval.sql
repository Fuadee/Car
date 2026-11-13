alter table public.vehicle_usage_requests
  add column if not exists approved_at timestamptz,
  add column if not exists rejected_at timestamptz,
  add column if not exists approved_by text,
  add column if not exists booking_id uuid references public.vehicle_bookings(id);

create unique index if not exists vehicle_usage_requests_booking_id_key
  on public.vehicle_usage_requests (booking_id)
  where booking_id is not null;

-- This correlation is the idempotency guard for approval retries: one request
-- can be the source of at most one real booking.
alter table public.vehicle_bookings
  add column if not exists source_usage_request_id uuid
    references public.vehicle_usage_requests(id);

create unique index if not exists vehicle_bookings_source_usage_request_id_key
  on public.vehicle_bookings (source_usage_request_id)
  where source_usage_request_id is not null;
