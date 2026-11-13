import { NextRequest, NextResponse } from "next/server";
import { reviewEarlyReturn } from "@/lib/early-returns/service";
import { clearManagerApprovalFailures, managerApprovalAllowed, managerClientKey, recordManagerApprovalFailure, verifyManagerPin } from "@/lib/vehicle-usage-requests/manager-auth";

export async function POST(request: NextRequest, context: { params: Promise<{ id: string; action: string }> }) {
  const key = managerClientKey(request.headers);
  if (!managerApprovalAllowed(key)) return NextResponse.json({ message: "ลองใหม่อีกครั้งในภายหลัง" }, { status: 429 });
  try {
    const { id, action } = await context.params;
    if (!/^[0-9a-f-]{36}$/i.test(id) || !["confirm", "reject"].includes(action)) return NextResponse.json({ message: "รายการไม่ถูกต้อง" }, { status: 400 });
    let body: Record<string, unknown> | null;
    try { body = await request.json() as Record<string, unknown> | null; } catch { return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
    const pin = await verifyManagerPin(String(body?.pin ?? ""));
    if (!pin.configured) return NextResponse.json({ message: "ยังไม่ได้ตั้งค่า Manager PIN" }, { status: 503 });
    if (!pin.ok) { recordManagerApprovalFailure(key); return NextResponse.json({ message: "PIN ไม่ถูกต้อง" }, { status: 401 }); }
    clearManagerApprovalFailures(key);
    const result = await reviewEarlyReturn(id, action === "confirm");
    return result.ok ? NextResponse.json({ request: result.data }) : NextResponse.json({ message: result.message }, { status: result.status });
  } catch { return NextResponse.json({ message: "ไม่สามารถยืนยันรายการคืนรถได้" }, { status: 502 }); }
}
