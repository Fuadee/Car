import { NextRequest, NextResponse } from "next/server";
import {
  clearManagerApprovalFailures,
  managerApprovalAllowed,
  managerClientKey,
  recordManagerApprovalFailure,
  verifyManagerPin,
} from "@/lib/vehicle-usage-requests/manager-auth";
import { cancelVehicleUsageRequest } from "@/lib/vehicle-usage-requests/mutations";
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
    const result = await cancelVehicleUsageRequest(usageRequest);
    return result.ok
      ? NextResponse.json({ ok: true, request: result.data, alreadyCancelled: result.alreadyCancelled })
      : NextResponse.json({ ok: false, message: result.message }, { status: result.status });
  } catch {
    return NextResponse.json({ ok: false, message: "ไม่สามารถยกเลิกการใช้รถได้" }, { status: 500 });
  }
}
