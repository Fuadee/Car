/** @vitest-environment jsdom */

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BookingApp } from "../app/booking-app";

vi.mock("../app/calendar-month", () => ({
  CalendarMonth: () => null,
}));

const fillBookingForm = () => {
  fireEvent.click(screen.getAllByRole("button", { name: "＋ จองรถ" })[0]);
  fireEvent.change(screen.getByLabelText(/ชื่อผู้ใช้งาน/), {
    target: { value: "ผู้ทดสอบ" },
  });
  fireEvent.change(screen.getByLabelText(/เวลาเริ่ม/), {
    target: { value: "09:00" },
  });
  fireEvent.change(screen.getByLabelText(/เวลาสิ้นสุด/), {
    target: { value: "11:00" },
  });
  fireEvent.change(screen.getByLabelText(/ภารกิจ/), {
    target: { value: "ทดสอบเวลาชน" },
  });
  fireEvent.change(screen.getByLabelText(/สถานที่/), {
    target: { value: "สำนักงาน" },
  });
};

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("booking conflict banner", () => {
  it("opens the same manage-booking sheet from both entry points and restores focus", async () => {
    render(<BookingApp />);

    const triggers = screen.getAllByRole("button", {
      name: "ตรวจสอบ แก้ไข หรือยกเลิกการจอง",
    });
    expect(triggers).toHaveLength(2);
    expect(triggers[0].getAttribute("aria-controls")).toBe("manage-booking-sheet");
    expect(triggers[1].getAttribute("aria-controls")).toBe("manage-booking-sheet");

    fireEvent.click(triggers[0]);
    expect(screen.getByRole("dialog", { name: "จัดการการจอง" })).toBeTruthy();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByLabelText("รหัสการจอง 6 หลัก")),
    );
    fireEvent.click(screen.getByRole("button", { name: "ปิดหน้าจัดการการจอง" }));
    await waitFor(() => expect(document.activeElement).toBe(triggers[0]));

    fireEvent.click(triggers[1]);
    expect(screen.getByRole("dialog", { name: "จัดการการจอง" })).toBeTruthy();
  });

  it("renders from a 409 response even when conflict details are absent", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: vi.fn().mockResolvedValue({
        ok: false,
        message: "ช่วงเวลาที่เลือกมีผู้จองแล้ว กรุณาเลือกวันหรือเวลาใหม่",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<BookingApp />);
    fillBookingForm();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการจอง" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("ไม่สามารถจองช่วงเวลานี้ได้");
    expect(alert.textContent).toContain(
      "ช่วงเวลาที่เลือกมีผู้จองแล้ว กรุณาเลือกวันหรือเวลาใหม่",
    );
    expect(screen.getByRole("button", { name: "เลือกเวลาใหม่" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "จองรถส่วนกลาง" })).toBeTruthy();
    expect((screen.getByLabelText(/เวลาเริ่ม/) as HTMLInputElement).value).toBe("09:00");

    fireEvent.click(screen.getByRole("button", { name: "เลือกเวลาใหม่" }));
    expect(document.activeElement).toBe(screen.getByLabelText(/เวลาเริ่ม/));
    fireEvent.change(screen.getByLabelText(/เวลาเริ่ม/), {
      target: { value: "09:30" },
    });
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByLabelText(/เวลาเริ่ม/).getAttribute("aria-invalid")).toBe(
      "false",
    );
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it("uses the fallback conflict message when a 409 body cannot be parsed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: vi.fn().mockRejectedValue(new SyntaxError("Invalid JSON")),
      }),
    );

    render(<BookingApp />);
    fillBookingForm();
    fireEvent.click(screen.getByRole("button", { name: "ยืนยันการจอง" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain(
      "ช่วงเวลาที่เลือกมีผู้จองแล้ว กรุณาเลือกวันหรือเวลาใหม่",
    );
  });
});
