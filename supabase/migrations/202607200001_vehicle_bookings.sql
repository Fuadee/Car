create extension if not exists btree_gist;

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  license_plate text not null default 'ระบุภายหลัง',
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vehicle_bookings (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references public.vehicles(id),
  booking_reference text not null unique,
  management_code_hash text not null,
  booker_name text not null,
  purpose text not null,
  note text,
  start_time timestamptz not null,
  end_time timestamptz not null,
  status text not null default 'confirmed' check (status in ('confirmed','cancelled','completed')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  cancelled_at timestamptz,
  constraint booking_time_valid check (end_time > start_time),
  constraint confirmed_booking_no_overlap exclude using gist
    (vehicle_id with =, tstzrange(start_time, end_time, '[)') with &&)
    where (status = 'confirmed')
);

create index if not exists vehicle_bookings_vehicle_idx on public.vehicle_bookings(vehicle_id);
create index if not exists vehicle_bookings_start_idx on public.vehicle_bookings(start_time);
create index if not exists vehicle_bookings_end_idx on public.vehicle_bookings(end_time);
create index if not exists vehicle_bookings_status_idx on public.vehicle_bookings(status);

alter table public.vehicles enable row level security;
alter table public.vehicle_bookings enable row level security;

insert into public.vehicles (name, license_plate, description)
select 'รถยนต์ส่วนกลาง', 'ระบุภายหลัง', 'รถส่วนกลางสำหรับพนักงาน'
where not exists (select 1 from public.vehicles);
