import { NextRequest, NextResponse } from "next/server";
import { validateBookingInput } from "@/lib/bookings/validators";
import {
  getPendingVehicleUsageRequestCount,
  getPendingVehicleUsageRequests,
  getVehicleUsageRequestHistory,
} from "@/lib/vehicle-usage-requests/queries";
import { createVehicleUsageRequest } from "@/lib/vehicle-usage-requests/mutations";

const failure = (message: string, status: number, extra?: object) =>
  NextResponse.json({ ok: false, message, ...extra }, { status });

export async function GET(request: NextRequest) {
  try {
    if (request.nextUrl.searchParams.get("summary") === "count") {
      return NextResponse.json({
        ok: true,
        pendingCount: await getPendingVehicleUsageRequestCount(),
      });
    }
    return NextResponse.json({
      ok: true,
      requests:
        request.nextUrl.searchParams.get("status") === "history"
          ? await getVehicleUsageRequestHistory()
          : await getPendingVehicleUsageRequests(),
    });
  } catch {
    return failure("ไม่สามารถโหลดคำขอใช้รถได้ กรุณาลองใหม่", 502);
  }
}

export async function POST(request: NextRequest) {
  try {
    const validated = validateBookingInput(await request.json());
    if (!validated.ok) return failure(validated.message, 400);
    const result = await createVehicleUsageRequest(
      validated.data,
      validated.start,
      validated.end,
    );
    return result.ok
      ? NextResponse.json({ ok: true, request: result.data }, { status: 201 })
      : failure(
          result.message,
          result.status,
          result.conflict ? { conflict: result.conflict } : undefined,
        );
  } catch {
    return failure("ไม่สามารถส่งคำขอใช้รถได้ กรุณาลองใหม่", 500);
  }
}
