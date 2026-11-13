import { NextRequest, NextResponse } from "next/server";
import { listEarlyReturns, requestEarlyReturn } from "@/lib/early-returns/service";
import { supabaseAdminRequest } from "@/lib/supabase/admin";

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export async function GET(request: NextRequest) {
  try {
    const bookingId = request.nextUrl.searchParams.get("bookingId");
    if (bookingId) {
      if (!uuid.test(bookingId)) return NextResponse.json({ message: "รายการไม่ถูกต้อง" }, { status: 400 });
      const response = await supabaseAdminRequest(`vehicle_early_return_requests?select=*&booking_id=eq.${bookingId}&status=eq.pending&limit=1`);
      if (!response.ok) throw new Error("RETURN_READ_FAILED");
      return NextResponse.json({ requests: await response.json(), serverTime: new Date().toISOString() }, { headers: { "Cache-Control": "no-store" } });
    }
    return NextResponse.json({ requests: await listEarlyReturns() }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "ไม่สามารถโหลดรายการคืนรถได้" }, { status: 502 }); }
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown> | null;
  try { body = await request.json() as Record<string, unknown> | null; } catch { return NextResponse.json({ message: "ข้อมูลไม่ถูกต้อง" }, { status: 400 }); }
  if (typeof body?.bookingId !== "string" || !uuid.test(body.bookingId)) return NextResponse.json({ message: "รายการไม่ถูกต้อง" }, { status: 400 });
  try {
    // No client timestamp, status, or actual_return_at is accepted.
    const result = await requestEarlyReturn(body.bookingId);
    return result.ok ? NextResponse.json({ request: result.data }) : NextResponse.json({ message: result.message }, { status: result.status });
  } catch { return NextResponse.json({ message: "ไม่สามารถแจ้งคืนรถได้" }, { status: 502 }); }
}
