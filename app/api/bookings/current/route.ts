import { NextResponse } from "next/server";
import { getBookingsForRange } from "@/lib/bookings/queries";

export async function GET() {
  try {
    const now = new Date();
    return NextResponse.json({ bookings: await getBookingsForRange(now, new Date(now.getTime() + 366 * 86_400_000)) }, { headers: { "Cache-Control": "no-store" } });
  } catch { return NextResponse.json({ message: "ไม่สามารถโหลดสถานะรถได้" }, { status: 502 }); }
}
