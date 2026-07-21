/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarMonth, type VehicleBooking } from "../app/calendar-month";

const booking = (
  id: string,
  startAt: string,
  endAt: string,
): VehicleBooking => ({
  id,
  startAt,
  endAt,
  name: "ผู้ทดสอบ",
  purpose: "ทดสอบสถานะ",
  location: "สำนักงาน",
  status: "confirmed",
  updatedAt: startAt,
});

afterEach(cleanup);

describe("mobile calendar day status", () => {
  it("exposes each visual day status in the gridcell label and class", () => {
    render(
      <CalendarMonth
        bookings={[
          booking("active", "2026-07-21T00:00:00+07:00", "2026-07-22T00:00:00+07:00"),
          booking("full", "2026-07-22T00:00:00+07:00", "2026-07-23T00:00:00+07:00"),
          booking("partial", "2026-07-23T09:00:00+07:00", "2026-07-23T12:00:00+07:00"),
        ]}
        initialMonth={new Date(2026, 6, 21)}
        today={new Date(2026, 6, 21)}
        loading={false}
        error=""
        onRetry={vi.fn()}
        onRangeChange={vi.fn()}
        onBook={vi.fn()}
        onEvent={vi.fn()}
      />,
    );

    expect(screen.getByRole("gridcell", { name: "2026-07-21 ใช้งานอยู่, 1 รายการ" }).className).toContain("status-inUse");
    expect(screen.getByRole("gridcell", { name: "2026-07-22 เต็มทั้งวัน, 1 รายการ" }).className).toContain("status-full");
    expect(screen.getByRole("gridcell", { name: "2026-07-23 ยังมีเวลาว่าง, 1 รายการ" }).className).toContain("status-partial");
    expect(screen.getByRole("gridcell", { name: "2026-07-24 ว่างทั้งวัน" }).className).toContain("status-available");
  });
});
