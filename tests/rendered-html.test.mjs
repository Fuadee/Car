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

test("keeps Supabase credentials server-side and protects overlap", async () => {
  const [admin, client, migration] = await Promise.all([
    readFile(new URL("../lib/supabase/admin.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/booking-app.tsx", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/202607200001_vehicle_bookings.sql", import.meta.url), "utf8"),
  ]);
  assert.match(admin, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(client, /SUPABASE_SERVICE_ROLE_KEY|serviceRoleKey/);
  assert.match(migration, /exclude using gist/i);
  assert.match(migration, /confirmed_booking_no_overlap/);
});
