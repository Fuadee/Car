/** @vitest-environment jsdom */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CalendarMonth } from "../app/calendar-month";
import { parseBookingDateParam } from "../lib/bookings/deep-link";

afterEach(cleanup);

describe("booking calendar deep link", () => {
  it("accepts only real canonical calendar dates", () => {
    expect(parseBookingDateParam("2026-08-18")).toBe("2026-08-18");
    expect(parseBookingDateParam("2026-02-29")).toBeNull();
    expect(parseBookingDateParam("2026-8-18")).toBeNull();
    expect(parseBookingDateParam("javascript:alert(1)")).toBeNull();
  });

  it("opens the calendar with the deep-linked day selected", () => {
    render(
      <CalendarMonth
        bookings={[]}
        initialMonth={new Date(2026, 7, 18)}
        today={new Date(2026, 7, 17)}
        loading={false}
        error=""
        onRetry={vi.fn()}
        onRangeChange={vi.fn()}
        onBook={vi.fn()}
        onEvent={vi.fn()}
      />,
    );

    expect(
      screen.getByRole("gridcell", { name: "2026-08-18 ว่างทั้งวัน" }).className,
    ).toContain("isSelected");
  });
});
