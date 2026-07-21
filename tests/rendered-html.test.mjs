import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(new Request("http://localhost/", { headers: { accept: "text/html" } }), {
    ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) },
  }, { waitUntil() {}, passThroughOnException() {} });
}

test("server-renders the vehicle booking calendar with the local font", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<title>ระบบจองรถส่วนกลาง<\/title>/);
  assert.match(html, /ปฏิทินการใช้รถ/);
  assert.match(html, /LINESeedSansTH_W_Rg/);
  assert.match(html, /<body class="__font_local_/);
  assert.match(html, /กำลังโหลดตารางการใช้รถ/);
});

test("keeps booking credentials server-side and protects booking-code access", async () => {
  const [admin, client, styles, migration, queries, bookingCode, uniqueCodeMigration] = await Promise.all([
    readFile(new URL("../lib/supabase/admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/booking-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/globals.css", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202607200001_vehicle_bookings.sql", import.meta.url), "utf8"),
    readFile(new URL("../lib/bookings/queries.ts", import.meta.url), "utf8"),
    readFile(new URL("../lib/bookings/booking-code.ts", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202607210003_unique_booking_code_hash.sql", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/);
  assert.match(migration, /exclude using gist/i);
  assert.match(migration, /confirmed_booking_no_overlap/);
  assert.match(queries, /purpose: row\.purpose/);
  assert.match(client, /<dt>ภารกิจ<\/dt>/);
  assert.match(client, /detail\.purpose \|\| "ไม่ระบุ"/);
  assert.match(client, /bookingCode/);
  assert.doesNotMatch(client, /manageReference|managementCode/);
  assert.match(client, /className="conflictBanner" role="alert" aria-live="assertive"/);
  assert.match(client, /เลือกเวลาใหม่/);
  assert.match(client, /ref=\{startTimeRef\}/);
  assert.match(client, /const setScheduleField = \([\s\S]*setTimeConflict\(null\)/);
  assert.doesNotMatch(client, /async function submit[\s\S]{0,180}setTimeConflict\(null\)/);
  assert.match(client, /response\.status === 409/);
  assert.match(client, /result\.conflict\?\.startAt \?\? null/);
  assert.doesNotMatch(client, /useLayoutEffect|scrollTo|scrollIntoView|modalScrollRef|conflictErrorRef|bookingToast/);
  assert.match(styles, /\.formBody \{[\s\S]*overflow-y: auto/);
  assert.match(styles, /\.sheet \{[\s\S]*overflow: hidden/);
  assert.match(styles, /\.sheetFoot \{[\s\S]*flex: none/);
  assert.match(styles, /\.conflictBanner \{/);
  assert.match(client, /aria-invalid=\{Boolean\(timeConflict\)\}/);
  assert.match(client, /ไม่สามารถจองช่วงเวลานี้ได้/);
  assert.match(client, /ช่วงเวลาที่เลือกมีผู้จองแล้ว กรุณาเลือกวันหรือเวลาใหม่/);
  assert.match(bookingCode, /crypto\.getRandomValues/);
  assert.match(bookingCode, /padStart\(6, "0"\)/);
  assert.match(uniqueCodeMigration, /create unique index/i);
});
