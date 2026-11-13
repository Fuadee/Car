create table if not exists public.vehicle_usage_requests (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  booker_name text not null,
  purpose text not null,
  destination text not null,
  note text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicle_usage_request_time_valid check (end_time > start_time)
);

create index if not exists vehicle_usage_requests_status_created_idx
  on public.vehicle_usage_requests (status, created_at desc);
create index if not exists vehicle_usage_requests_vehicle_idx
  on public.vehicle_usage_requests (vehicle_id);

alter table public.vehicle_usage_requests enable row level security;
revoke all on public.vehicle_usage_requests from anon, authenticated;

drop trigger if exists vehicle_usage_requests_set_updated_at on public.vehicle_usage_requests;
create trigger vehicle_usage_requests_set_updated_at
before update on public.vehicle_usage_requests
for each row execute function public.set_updated_at();
