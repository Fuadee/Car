alter table public.vehicle_usage_requests
  drop constraint if exists vehicle_usage_requests_status_check;

alter table public.vehicle_usage_requests
  add constraint vehicle_usage_requests_status_check
  check (status in ('pending', 'approved', 'rejected', 'cancelled'));

alter table public.vehicle_usage_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancelled_by text;
