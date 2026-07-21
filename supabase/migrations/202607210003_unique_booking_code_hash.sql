-- The existing management_code_hash is the HMAC of the six-digit code users
-- already received. Preserve it and make its uniqueness database-enforced.
-- Rows cannot be missing this value because the original column is NOT NULL.
-- This migration deliberately stops if legacy duplicates exist so no existing
-- user's code is silently changed.
do $$
begin
  if exists (
    select 1
    from public.vehicle_bookings
    group by management_code_hash
    having count(*) > 1
  ) then
    raise exception 'Duplicate booking-code hashes exist; resolve them before creating the unique index.';
  end if;
end;
$$;

create unique index if not exists vehicle_bookings_management_code_hash_key
  on public.vehicle_bookings (management_code_hash);
