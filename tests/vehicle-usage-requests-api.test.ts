import { NextRequest } from "next/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createVehicleUsageRequest: vi.fn(),
  getPendingVehicleUsageRequests: vi.fn(),
}));

vi.mock("../lib/vehicle-usage-requests/mutations", () => ({
  createVehicleUsageRequest: mocks.createVehicleUsageRequest,
}));
vi.mock("../lib/vehicle-usage-requests/queries", () => ({
  getPendingVehicleUsageRequestCount: vi.fn(),
  getPendingVehicleUsageRequests: mocks.getPendingVehicleUsageRequests,
  getVehicleUsageRequestHistory: vi.fn(),
}));

import { GET } from "../app/api/vehicle-usage-requests/route";

describe("vehicle usage request API", () => {
  it("does not create a request or send a notification for GET", async () => {
    mocks.getPendingVehicleUsageRequests.mockResolvedValue([]);

    const response = await GET(new NextRequest("https://example.com/api/vehicle-usage-requests"));

    expect(response.status).toBe(200);
    expect(mocks.createVehicleUsageRequest).not.toHaveBeenCalled();
  });
});
