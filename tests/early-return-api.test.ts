import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ db: vi.fn(), booking: vi.fn(), push: vi.fn() }));
vi.mock("../lib/supabase/admin", () => ({ supabaseAdminRequest: mocks.db }));
vi.mock("../lib/bookings/queries", async original => ({ ...await original<typeof import("../lib/bookings/queries")>(), getBookingById: mocks.booking }));
vi.mock("../lib/line/client", () => ({ sendLinePushMessage: mocks.push }));
import { requestEarlyReturn } from "../lib/early-returns/service";
import { POST as review } from "../app/api/early-returns/[id]/[action]/route";
import { POST as create } from "../app/api/early-returns/route";
import { checkBookingConflict } from "../lib/bookings/queries";

const id = "00000000-0000-4000-8000-000000000001";
const pending = { id, booking_id: id, status: "pending", requested_at: "2026-11-13T06:20:00Z" };
const response = (body: unknown) => new Response(JSON.stringify(body));
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("MANAGER_APPROVAL_PIN", "654321"); vi.stubEnv("MANAGER_LINE_USER_ID", "manager"); vi.stubEnv("APP_BASE_URL", "https://example.com");
  mocks.booking.mockResolvedValue({ id, booker_name: "ผู้ทดสอบ", purpose: "ประชุม", start_time: "2026-11-13T00:00:00Z", end_time: "2026-11-13T10:00:00Z" });
  mocks.push.mockResolvedValue(true);
});
describe("early return server flow", () => {
  it("pushes only once for the creator, uses the manager recipient and return deep link, and keeps pending", async () => {
    mocks.db.mockResolvedValueOnce(response({ request: pending, created: true })).mockResolvedValueOnce(response({ request: pending, created: false }));
    expect(await requestEarlyReturn(id)).toMatchObject({ ok: true, data: { status: "pending" } });
    await requestEarlyReturn(id);
    expect(mocks.push).toHaveBeenCalledTimes(1);
    expect(mocks.push).toHaveBeenCalledWith(expect.any(Array), "manager");
    expect(JSON.stringify(mocks.push.mock.calls[0][0])).toContain(`https://example.com/vehicle-usage?returnRequest=${id}`);
    expect(mocks.db).toHaveBeenCalledWith("rpc/request_vehicle_early_return", { method: "POST", body: JSON.stringify({ p_booking_id: id }) });
  });
  it("keeps a successful request when LINE fails", async () => {
    mocks.db.mockResolvedValue(response({ request: pending, created: true })); mocks.push.mockRejectedValue(new Error("network"));
    expect(await requestEarlyReturn(id)).toMatchObject({ ok: true, data: { status: "pending" } });
    expect(mocks.db).toHaveBeenCalledTimes(1);
  });
  it("discards client-supplied return time and status", async () => {
    mocks.db.mockResolvedValue(response({ request: pending, created: false }));
    const result = await create(new NextRequest("https://example.com/api/early-returns", { method: "POST", body: JSON.stringify({ bookingId: id, actual_return_at: "2000-01-01", requested_at: "2000-01-01", status: "confirmed" }) }));
    expect(result.status).toBe(200);
    expect(JSON.parse(mocks.db.mock.calls[0][1].body)).toEqual({ p_booking_id: id });
  });
  it.each(["confirm", "reject"])("requires the existing server PIN for %s without mutating on a wrong PIN", async action => {
    const result = await review(new NextRequest("https://example.com", { method: "POST", body: JSON.stringify({ pin: "000000" }), headers: { "x-real-ip": action } }), { params: Promise.resolve({ id, action }) });
    expect(result.status).toBe(401); expect(mocks.db).not.toHaveBeenCalled();
  });
  it.each(["confirm", "reject"])("uses atomic database RPC for manager %s", async action => {
    mocks.db.mockResolvedValue(response({ ...pending, status: action === "confirm" ? "confirmed" : "rejected" }));
    const result = await review(new NextRequest("https://example.com", { method: "POST", body: JSON.stringify({ pin: "654321" }) }), { params: Promise.resolve({ id, action }) });
    expect(result.status).toBe(200);
    expect(mocks.db).toHaveBeenCalledWith("rpc/review_vehicle_early_return", { method: "POST", body: JSON.stringify({ p_request_id: id, p_confirm: action === "confirm" }) });
    expect(mocks.push).not.toHaveBeenCalled();
  });
  it("queries effective end in conflict checks so released time is available", async () => {
    mocks.db.mockResolvedValue(response([]));
    expect(await checkBookingConflict("vehicle", new Date("2026-11-13T07:00:00Z"), new Date("2026-11-13T09:00:00Z"))).toBeNull();
    const params = new URLSearchParams(mocks.db.mock.calls[0][0].split("?")[1]);
    expect(params.get("effective_end_time")).toBe("gt.2026-11-13T07:00:00.000Z"); expect(params.has("end_time")).toBe(false);
  });
});
