import { NextRequest, NextResponse } from "next/server";
import { hashBookingCode, isBookingCode } from "@/lib/bookings/booking-code";
import { getBookingByCodeHash } from "@/lib/bookings/queries";
import {
  clearLookupFailures,
  lookupAllowed,
  lookupClientKey,
  recordLookupFailure,
} from "@/lib/bookings/lookup-rate-limit";

export async function POST(request: NextRequest) {
  try {
    const clientKey = lookupClientKey(request.headers);
    if (!lookupAllowed(clientKey))
      return NextResponse.json(
        { ok: false, message: "ลองใหม่อีกครั้งในภายหลัง" },
        { status: 429 },
      );
    const body = (await request.json()) as Record<string, unknown>;
    const bookingCode = String(body.bookingCode ?? "");
    if (!isBookingCode(bookingCode)) {
      recordLookupFailure(clientKey);
      return NextResponse.json(
        { ok: false, message: "กรุณากรอกรหัสการจองให้ครบ 6 หลัก" },
        { status: 400 },
      );
    }
    const row = await getBookingByCodeHash(await hashBookingCode(bookingCode));
    if (!row) {
      recordLookupFailure(clientKey);
      return NextResponse.json(
        { ok: false, message: "ไม่พบการจองจากรหัสนี้ กรุณาตรวจสอบแล้วลองอีกครั้ง" },
        { status: 404 },
      );
    }
    clearLookupFailures(clientKey);
    return NextResponse.json({
      ok: true,
      booking: {
        id: row.id,
        startAt: row.start_time,
        endAt: row.end_time,
        name: row.booker_name,
        purpose: row.purpose,
        destination: row.destination,
        note: row.note ?? "",
        status: row.status,
        updatedAt: row.updated_at,
      },
    });
  } catch {
    return NextResponse.json(
      { ok: false, message: "ตรวจสอบการจองไม่สำเร็จ" },
      { status: 500 },
    );
  }
}
