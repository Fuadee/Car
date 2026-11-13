// @vitest-environment node
import { PGlite } from "@electric-sql/pglite";
import { btree_gist } from "@electric-sql/pglite/contrib/btree_gist";
import { readFileSync, readdirSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const db = new PGlite({ extensions: { btree_gist } });
const bid = "00000000-0000-4000-8000-000000000001";
let vehicle: string;
async function booking(id = bid, vehicleId = vehicle, start = "clock_timestamp() - interval '2 hours'", end = "clock_timestamp() + interval '4 hours'") {
  await db.query(`insert into vehicle_bookings(id,vehicle_id,booking_reference,management_code_hash,booker_name,purpose,start_time,end_time) values ($1::uuid,$2::uuid,$1::text,$1::text,'ทดสอบ','ประชุม',${start},${end})`, [id, vehicleId]);
}
async function request(id = bid) {
  return (await db.query<{ result: { request: { id: string; requested_at: string }; created: boolean } }>("select request_vehicle_early_return($1) as result", [id])).rows[0].result;
}
async function review(id: string, confirm: boolean) {
  return (await db.query<{ result: { status: string; confirmed_at: string; requested_at: string } }>("select review_vehicle_early_return($1,$2) as result", [id, confirm])).rows[0].result;
}

describe("early return PostgreSQL integration", () => {
  beforeAll(async () => {
    await db.exec("create role anon; create role authenticated; create role service_role;");
    for (const file of readdirSync("supabase/migrations").filter(f => f.endsWith(".sql")).sort()) await db.exec(readFileSync(`supabase/migrations/${file}`, "utf8"));
    vehicle = (await db.query<{ id: string }>("select id from vehicles limit 1")).rows[0].id;
  }, 60_000);
  afterAll(async () => { await db.close(); });

  it("keeps pending blocked, confirms atomically at request time, preserves the plan, and enforces effective overlap", async () => {
    await booking();
    const original = (await db.query<{ end_time: Date }>("select end_time from vehicle_bookings where id=$1", [bid])).rows[0].end_time;
    const [first, retry] = await Promise.all([request(), request()]);
    expect(first.created).toBe(true); expect(retry.created).toBe(false); expect(retry.request.id).toBe(first.request.id);
    expect((await db.query("select actual_return_at from vehicle_bookings where id=$1", [bid])).rows[0]).toEqual({ actual_return_at: null });
    await expect(booking("00000000-0000-4000-8000-000000000002", vehicle, "clock_timestamp() + interval '1 hour'", "clock_timestamp() + interval '2 hours'")).rejects.toMatchObject({ code: "23P01" });
    await expect(db.query("insert into vehicle_early_return_requests(booking_id) values ($1)", [bid])).rejects.toMatchObject({ code: "23505" });
    const confirmed = await review(first.request.id, true);
    expect(confirmed.status).toBe("confirmed");
    expect(new Date(confirmed.confirmed_at).getTime()).toBeGreaterThanOrEqual(new Date(first.request.requested_at).getTime());
    const row = (await db.query<{ end_time: Date; actual_return_at: Date }>("select end_time,actual_return_at from vehicle_bookings where id=$1", [bid])).rows[0];
    expect(row.end_time).toEqual(original);
    expect(row.actual_return_at.toISOString()).toBe(new Date(first.request.requested_at).toISOString());
    expect(await review(first.request.id, true)).toEqual(confirmed);
    await expect(db.query("update vehicle_bookings set end_time=end_time + interval '1 hour' where id=$1", [bid])).rejects.toThrow("RETURNED_BOOKING_IMMUTABLE");
    await expect(db.query("update vehicle_bookings set status='cancelled' where id=$1", [bid])).rejects.toThrow("RETURNED_BOOKING_IMMUTABLE");
    await expect(review(first.request.id, false)).rejects.toThrow("RETURN_ALREADY_REVIEWED");
    await booking("00000000-0000-4000-8000-000000000002", vehicle, "clock_timestamp() + interval '1 hour'", "clock_timestamp() + interval '2 hours'");
    await expect(booking("00000000-0000-4000-8000-000000000003", vehicle, "clock_timestamp() - interval '1 hour'", "clock_timestamp() + interval '30 minutes'")).rejects.toMatchObject({ code: "23P01" });
    await expect(request()).rejects.toThrow("BOOKING_NOT_ACTIVE");
  });

  it("rejects without releasing, permits another request, and cannot confirm cancelled bookings", async () => {
    const v = (await db.query<{ id: string }>("insert into vehicles(name) values ('รถทดสอบ') returning id")).rows[0].id;
    const id = "00000000-0000-4000-8000-000000000004";
    await booking(id, v);
    const first = await request(id);
    expect((await review(first.request.id, false)).status).toBe("rejected");
    expect((await db.query("select actual_return_at,end_time=effective_end_time as blocked from vehicle_bookings where id=$1", [id])).rows[0]).toEqual({ actual_return_at: null, blocked: true });
    const next = await request(id); expect(next.request.id).not.toBe(first.request.id);
    await db.query("update vehicle_bookings set status='cancelled' where id=$1", [id]);
    await expect(review(next.request.id, true)).rejects.toThrow("BOOKING_NOT_ACTIVE");
    expect((await db.query("select status from vehicle_early_return_requests where id=$1", [next.request.id])).rows[0]).toEqual({ status: "pending" });
    await review(next.request.id, false);
  });

  it("rejects future, expired and cancelled bookings and denies public writes and RPCs", async () => {
    for (const [suffix, start, end] of [["5", "clock_timestamp() + interval '1 day'", "clock_timestamp() + interval '2 days'"], ["6", "clock_timestamp() - interval '2 days'", "clock_timestamp() - interval '1 day'"]]) {
      const id = `00000000-0000-4000-8000-00000000000${suffix}`;
      await booking(id, vehicle, start, end); await expect(request(id)).rejects.toThrow("BOOKING_NOT_ACTIVE");
    }
    expect((await db.query<{ allowed: boolean }>("select has_function_privilege('anon','request_vehicle_early_return(uuid)','execute') as allowed")).rows[0].allowed).toBe(false);
    expect((await db.query<{ allowed: boolean }>("select has_function_privilege('authenticated','review_vehicle_early_return(uuid,boolean)','execute') as allowed")).rows[0].allowed).toBe(false);
    expect((await db.query<{ allowed: boolean }>("select has_table_privilege('anon','vehicle_early_return_requests','insert') as allowed")).rows[0].allowed).toBe(false);
  });
});
