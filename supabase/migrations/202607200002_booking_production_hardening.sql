alter table public.vehicle_bookings
  add column if not exists destination text not null default 'ไม่ระบุสถานที่';

create or replace function public.set_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists vehicle_bookings_set_updated_at on public.vehicle_bookings;
create trigger vehicle_bookings_set_updated_at
before update on public.vehicle_bookings
for each row execute function public.set_updated_at();

-- Public clients must never query or mutate booking rows directly. All access
-- goes through validated server routes. Service-role access remains server-only.
revoke all on public.vehicle_bookings from anon, authenticated;
revoke all on public.vehicles from anon, authenticated;
