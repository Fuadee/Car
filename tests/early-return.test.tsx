import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { canRequestEarlyReturn, effectiveEnd, isActiveBooking } from "../lib/bookings/availability";
import { EarlyReturnAction } from "../app/early-return-action";
import type { VehicleBooking } from "../app/calendar-month";

const booking: VehicleBooking = { id: "00000000-0000-4000-8000-000000000001", startAt: "2026-11-13T00:00:00Z", endAt: "2026-11-13T10:00:00Z", name: "ผู้ทดสอบ", purpose: "ประชุม", location: "สำนักงาน", status: "confirmed", updatedAt: "2026-11-13T00:00:00Z" };
const now = new Date("2026-11-13T06:20:00Z");
beforeEach(() => { vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ requests: [], serverTime: now.toISOString() }) })); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
describe("early return action and availability", () => {
  it.each([["2026-11-12T23:00:00Z", false], ["2026-11-13T00:00:00Z", true], ["2026-11-13T06:20:00Z", true], ["2026-11-13T10:00:00Z", false]])("shows the button only during confirmed usage at %s", (at, visible) => {
    render(<EarlyReturnAction booking={booking} now={new Date(at)} onChange={() => {}} />);
    expect(!!screen.queryByRole("button", { name: /แจ้งคืนรถก่อนกำหนด/ })).toBe(visible);
  });
  it("does not offer another action for returned or cancelled bookings", () => {
    expect(canRequestEarlyReturn({ ...booking, actualReturnAt: now.toISOString() }, now)).toBe(false);
    expect(canRequestEarlyReturn({ ...booking, status: "cancelled" }, now)).toBe(false);
    expect(canRequestEarlyReturn(booking, now, true)).toBe(false);
    expect(isActiveBooking(booking, now)).toBe(true);
    expect(isActiveBooking({ ...booking, actualReturnAt: now.toISOString() }, now)).toBe(false);
    expect(effectiveEnd(booking)).toBe(booking.endAt);
  });
  it("previews server time, submits no client timestamp, and disables duplicate actions while pending", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockImplementation(async (_url, init) => ({ ok: true, json: async () => init?.method === "POST" ? { request: { id: "return-1", status: "pending", requested_at: now.toISOString() } } : { requests: [], serverTime: now.toISOString() } }) as Response);
    render(<EarlyReturnAction booking={booking} now={now} onChange={() => {}} />);
    fireEvent.click(screen.getByRole("button", { name: /แจ้งคืนรถก่อนกำหนด/ }));
    await screen.findByRole("dialog");
    expect(screen.getByText(/เวลาที่แจ้งคืน:.*13:20/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันแจ้งคืน" }));
    await screen.findByRole("status");
    expect(screen.queryByRole("button", { name: /แจ้งคืนรถก่อนกำหนด/ })).toBeNull();
    const posts = fetchMock.mock.calls.filter(([, init]) => init?.method === "POST");
    expect(posts).toHaveLength(1); expect(JSON.parse(posts[0][1]!.body as string)).toEqual({ bookingId: booking.id });
  });
  it("recovers a pending request after reloading", async () => {
    vi.mocked(fetch).mockResolvedValue({ ok: true, json: async () => ({ requests: [{ requested_at: now.toISOString(), status: "pending" }], serverTime: now.toISOString() }) } as Response);
    render(<EarlyReturnAction booking={booking} now={now} onChange={() => {}} />);
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("รอหัวหน้ายืนยันคืนรถ"));
  });
});
