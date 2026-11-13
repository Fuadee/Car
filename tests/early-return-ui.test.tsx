import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingApp } from "../app/booking-app";
import { CalendarMonth, type VehicleBooking } from "../app/calendar-month";
import VehicleUsagePage from "../app/vehicle-usage/page";

afterEach(() => { cleanup(); vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
const id = "00000000-0000-4000-8000-000000000001";
describe("early return integrated UI", () => {
  it("keeps the active Home action above booking when browsing a different calendar month", async () => {
    const now = Date.now();
    const active = { id, startAt: new Date(now - 3600000).toISOString(), endAt: new Date(now + 3600000).toISOString(), name: "ผู้ทดสอบ", purpose: "ประชุม", status: "confirmed" };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => ({ ok: true, json: async () => url === "/api/bookings/current" ? { bookings: [active] } : url.startsWith("/api/bookings?") ? { bookings: [] } : { requests: [], serverTime: new Date().toISOString() } })));
    render(<BookingApp />);
    const action = await screen.findByRole("button", { name: /แจ้งคืนรถก่อนกำหนด/ });
    const book = screen.getAllByRole("button", { name: "＋ จองรถ" })[0];
    expect(action.parentElement).toBe(book.parentElement);
    expect(action.compareDocumentPosition(book) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "เดือนถัดไป" }));
    await waitFor(() => expect(screen.getByRole("button", { name: /แจ้งคืนรถก่อนกำหนด/ })).toBeTruthy());
  });
  it("marks later days free while preserving the planned calendar event and actual return annotation", () => {
    const entry: VehicleBooking = { id, startAt: "2026-11-13T00:00:00Z", endAt: "2026-11-15T10:00:00Z", actualReturnAt: "2026-11-13T06:20:00Z", name: "ผู้ทดสอบ", purpose: "ประชุม", location: "สำนักงาน", status: "confirmed", updatedAt: "2026-11-13T06:35:00Z" };
    render(<CalendarMonth bookings={[entry]} initialMonth={new Date(2026, 10, 13)} today={new Date("2026-11-13T07:00:00Z")} loading={false} error="" onRetry={() => {}} onRangeChange={() => {}} onBook={() => {}} onEvent={() => {}} />);
    expect(screen.getByRole("gridcell", { name: "2026-11-14 ว่างทั้งวัน, 1 รายการ" })).toBeTruthy();
    expect(screen.getByRole("gridcell", { name: "2026-11-13 ยังมีเวลาว่าง, 1 รายการ" })).toBeTruthy();
    expect(screen.getAllByText(/คืนก่อนกำหนด 13:20/).length).toBeGreaterThan(0);
    expect(screen.getAllByTitle(/07:00–17:00.*คืนก่อนกำหนด 13:20/).length).toBeGreaterThan(0);
  });
  it.each([["ยืนยันคืนรถ", "confirm"], ["ไม่ยืนยัน", "reject"]])("opens the existing manager PIN dialog for %s from the LINE deep link", async (label, action) => {
    window.history.replaceState({}, "", `/?returnRequest=${id}`);
    const pending = { id, booking_id: id, status: "pending", requested_at: "2026-11-13T06:20:00Z", booking: { name: "ผู้ทดสอบ", purpose: "ประชุม", startAt: "2026-11-13T00:00:00Z", endAt: "2026-11-13T10:00:00Z" } };
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method === "POST" ? { request: { ...pending, status: "confirmed" } } : url === "/api/early-returns" ? { requests: [pending] } : { requests: [] } }));
    vi.stubGlobal("fetch", fetchMock);
    render(<VehicleUsagePage />);
    fireEvent.click(await screen.findByRole("button", { name: label }));
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Manager PIN"), { target: { value: "654321" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "ยืนยัน" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/early-returns/${id}/${action}`, expect.objectContaining({ method: "POST", body: JSON.stringify({ pin: "654321" }) })));
    expect(document.getElementById(`return-${id}`)?.className).toContain("returnHighlighted");
  });
});
