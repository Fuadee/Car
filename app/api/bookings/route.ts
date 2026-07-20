import { NextRequest, NextResponse } from "next/server";
import { createBooking } from "@/lib/bookings/mutations";
import { getBookingsForRange } from "@/lib/bookings/queries";
import { validRange, validateBookingInput } from "@/lib/bookings/validators";

const failure = (message: string, status: number, extra?: object) =>
  NextResponse.json({ ok: false, message, ...extra }, { status });

export async function GET(request: NextRequest) {
  const range = validRange(
    request.nextUrl.searchParams.get("start"),
    request.nextUrl.searchParams.get("end"),
  );
  if (!range) return failure("ช่วงวันที่ไม่ถูกต้อง", 400);
  try {
    return NextResponse.json(
      { ok: true, bookings: await getBookingsForRange(range.from, range.to) },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return failure("ไม่สามารถโหลดปฏิทินได้ กรุณาลองใหม่", 502);
  }
}

export async function POST(request: NextRequest) {
  try {
    const validated = validateBookingInput(await request.json());
    if (!validated.ok) return failure(validated.message, 400);
    const result = await createBooking(
      validated.data,
      validated.start,
      validated.end,
    );
    return result.ok
      ? NextResponse.json({ ok: true, ...result.data }, { status: 201 })
      : failure(
          result.message,
          result.status,
          result.conflict ? { conflict: result.conflict } : undefined,
        );
  } catch {
    return failure("ไม่สามารถบันทึกการจองได้ กรุณาลองใหม่", 500);
  }
}
