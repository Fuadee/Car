/** @vitest-environment jsdom */

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import VehicleUsagePage from "../app/vehicle-usage/page";

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ requests: [] }),
  }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("header navigation", () => {
  it("keeps the full vehicle-usage brand area as a home link without overlapping the usage link", () => {
    render(<VehicleUsagePage />);

    const homeLink = screen.getByRole("link", { name: "กลับหน้าหลัก" });
    expect(homeLink.getAttribute("href")).toBe("/");
    expect(within(homeLink).getByText("ระบบจองรถส่วนกลาง")).toBeTruthy();
    expect(within(homeLink).getByText("รายการคำขอใช้รถ")).toBeTruthy();

    const usageLink = screen.getByRole("link", { name: /การใช้รถ/ });
    expect(usageLink.getAttribute("href")).toBe("/vehicle-usage");
    expect(homeLink.contains(usageLink)).toBe(false);
  });
});
