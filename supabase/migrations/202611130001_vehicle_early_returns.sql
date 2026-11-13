begin;

alter table public.vehicle_bookings
  add column actual_return_at timestamptz,
  add column effective_end_time timestamptz generated always as (coalesce(actual_return_at, end_time)) stored,
  add constraint actual_return_valid check (actual_return_at is null or (actual_return_at >= start_time and actual_return_at < end_time));

alter table public.vehicle_bookings drop constraint confirmed_booking_no_overlap;
alter table public.vehicle_bookings add constraint confirmed_booking_no_overlap exclude using gist
  (vehicle_id with =, tstzrange(start_time, effective_end_time, '[)') with &&)
  where (status = 'confirmed');

-- Preserve the approved plan even when a legacy edit/cancel races confirmation.
create function public.preserve_returned_booking() returns trigger
language plpgsql set search_path = public as $$
begin
  if old.actual_return_at is not null and
    (new.actual_return_at is distinct from old.actual_return_at or
     new.start_time is distinct from old.start_time or
     new.end_time is distinct from old.end_time or new.status is distinct from old.status) then
    raise exception 'RETURNED_BOOKING_IMMUTABLE' using errcode = 'P0001';
  end if;
  if new.actual_return_at is not null and
    (new.start_time is distinct from old.start_time or new.end_time is distinct from old.end_time) then
    raise exception 'RETURN_PLAN_IMMUTABLE' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
create trigger preserve_returned_booking before update on public.vehicle_bookings
  for each row execute function public.preserve_returned_booking();

create table public.vehicle_early_return_requests (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references public.vehicle_bookings(id),
  requested_at timestamptz not null default now(),
  status text not null default 'pending' check (status in ('pending','confirmed','rejected')),
  confirmed_at timestamptz,
  rejected_at timestamptz,
  reviewed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint return_review_valid check (
    (status = 'pending' and confirmed_at is null and rejected_at is null and reviewed_by is null) or
    (status = 'confirmed' and confirmed_at is not null and rejected_at is null and reviewed_by is not null) or
    (status = 'rejected' and rejected_at is not null and confirmed_at is null and reviewed_by is not null))
);
create unique index vehicle_early_return_pending_unique on public.vehicle_early_return_requests(booking_id) where status = 'pending';
create index vehicle_early_return_booking_idx on public.vehicle_early_return_requests(booking_id);
alter table public.vehicle_early_return_requests enable row level security;
revoke all on public.vehicle_early_return_requests from anon, authenticated;
create trigger vehicle_early_return_set_updated_at before update on public.vehicle_early_return_requests
  for each row execute function public.set_updated_at();

-- Lock the booking first in both operations. The clock and requested time are
-- database-owned; retries recover the same pending request without another push.
create function public.request_vehicle_early_return(p_booking_id uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.vehicle_bookings; r public.vehicle_early_return_requests; t timestamptz;
begin
  select * into b from public.vehicle_bookings where id = p_booking_id for update;
  if not found then raise exception 'BOOKING_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into r from public.vehicle_early_return_requests where booking_id = b.id and status = 'pending';
  if found then return jsonb_build_object('request', to_jsonb(r), 'created', false); end if;
  t := clock_timestamp();
  if b.status <> 'confirmed' or b.actual_return_at is not null or t < b.start_time or t >= b.end_time then
    raise exception 'BOOKING_NOT_ACTIVE' using errcode = 'P0001';
  end if;
  insert into public.vehicle_early_return_requests(booking_id, requested_at) values (b.id, t) returning * into r;
  return jsonb_build_object('request', to_jsonb(r), 'created', true);
end;
$$;

create function public.review_vehicle_early_return(p_request_id uuid, p_confirm boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare b public.vehicle_bookings; r public.vehicle_early_return_requests; bid uuid; desired text;
begin
  select booking_id into bid from public.vehicle_early_return_requests where id = p_request_id;
  if not found then raise exception 'RETURN_NOT_FOUND' using errcode = 'P0002'; end if;
  select * into b from public.vehicle_bookings where id = bid for update;
  select * into r from public.vehicle_early_return_requests where id = p_request_id for update;
  desired := case when p_confirm then 'confirmed' else 'rejected' end;
  if r.status = desired then return to_jsonb(r); end if;
  if r.status <> 'pending' then raise exception 'RETURN_ALREADY_REVIEWED' using errcode = 'P0001'; end if;
  if p_confirm then
    if b.status <> 'confirmed' or b.actual_return_at is not null or r.requested_at < b.start_time or r.requested_at >= b.end_time then
      raise exception 'BOOKING_NOT_ACTIVE' using errcode = 'P0001';
    end if;
    update public.vehicle_bookings set actual_return_at = r.requested_at where id = b.id;
  end if;
  update public.vehicle_early_return_requests set status = desired, reviewed_by = 'หัวหน้า',
    confirmed_at = case when p_confirm then clock_timestamp() else null end,
    rejected_at = case when not p_confirm then clock_timestamp() else null end
    where id = r.id returning * into r;
  return to_jsonb(r);
end;
$$;
revoke all on function public.request_vehicle_early_return(uuid) from public, anon, authenticated;
revoke all on function public.review_vehicle_early_return(uuid, boolean) from public, anon, authenticated;
grant execute on function public.request_vehicle_early_return(uuid) to service_role;
grant execute on function public.review_vehicle_early_return(uuid, boolean) to service_role;
commit;
