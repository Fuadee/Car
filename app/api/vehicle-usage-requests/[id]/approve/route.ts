import { NextRequest, NextResponse } from "next/server";
import { validateBookingInput } from "@/lib/bookings/validators";
import {
  clearManagerApprovalFailures,
  managerApprovalAllowed,
  managerClientKey,
  recordManagerApprovalFailure,
  verifyManagerPin,
} from "@/lib/vehicle-usage-requests/manager-auth";
import { approveVehicleUsageRequest } from "@/lib/vehicle-usage-requests/mutations";
import { getVehicleUsageRequestById } from "@/lib/vehicle-usage-requests/queries";

type Context = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: Context) {
  const clientKey = managerClientKey(request.headers);
  if (!managerApprovalAllowed(clientKey))
    return NextResponse.json({ ok: false, message: "ลองใหม่อีกครั้งในภายหลัง" }, { status: 429 });
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const pinResult = await verifyManagerPin(String(body.pin ?? ""));
    if (!pinResult.configured)
      return NextResponse.json({ ok: false, message: "ยังไม่ได้ตั้งค่า Manager PIN" }, { status: 503 });
    if (!pinResult.ok) {
      recordManagerApprovalFailure(clientKey);
      return NextResponse.json({ ok: false, message: "PIN ไม่ถูกต้อง" }, { status: 401 });
    }
    clearManagerApprovalFailures(clientKey);
    const { id } = await context.params;
    const usageRequest = await getVehicleUsageRequestById(id);
    if (!usageRequest)
      return NextResponse.json({ ok: false, message: "ไม่พบคำขอใช้รถ" }, { status: 404 });
    if (usageRequest.status !== "pending" || usageRequest.bookingId)
      return NextResponse.json({ ok: false, message: "คำขอนี้ถูกดำเนินการแล้ว" }, { status: 409 });
    const validated = validateBookingInput({
      name: usageRequest.name,
      purpose: usageRequest.purpose,
      destination: usageRequest.destination,
      note: usageRequest.note ?? "",
      startAt: usageRequest.startAt,
      endAt: usageRequest.endAt,
    }, { allowPastStart: true });
    if (!validated.ok)
      return NextResponse.json({ ok: false, message: validated.message }, { status: 409 });
    const result = await approveVehicleUsageRequest(usageRequest);
    return result.ok
      ? NextResponse.json({ ok: true, ...result.data })
      : NextResponse.json(
          { ok: false, message: result.message, ...(result.conflict ? { conflict: result.conflict } : {}) },
          { status: result.status },
        );
  } catch {
    return NextResponse.json({ ok: false, message: "ไม่สามารถอนุมัติคำขอได้" }, { status: 500 });
  }
}
