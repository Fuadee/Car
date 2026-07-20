import { NextRequest, NextResponse } from "next/server";
import { cancelBooking, updateBooking } from "@/lib/bookings/mutations";
import { validateBookingInput } from "@/lib/bookings/validators";

type Context = { params: Promise<{ id: string }> };
const failure = (message: string, status: number, extra?: object) =>
  NextResponse.json({ ok: false, message, ...extra }, { status });

export async function PATCH(request: NextRequest, context: Context) {
  try {
    const { id } = await context.params;
    const body = (await request.json()) as Record<string, unknown>;
    if (body.action === "cancel") {
      const result = await cancelBooking(id, {
        reference: String(body.reference ?? ""),
        managementCode: String(body.managementCode ?? ""),
      });
      return result.ok
        ? NextResponse.json({ ok: true, booking: result.data })
        : failure(result.message, result.status);
    }
    const validated = validateBookingInput(body);
    if (!validated.ok) return failure(validated.message, 400);
    const result = await updateBooking(
      id,
      {
        ...validated.data,
        reference: String(body.reference ?? ""),
        managementCode: String(body.managementCode ?? ""),
        updatedAt: String(body.updatedAt ?? ""),
      },
      validated.start,
      validated.end,
    );
    return result.ok
      ? NextResponse.json({ ok: true, booking: result.data })
      : failure(
          result.message,
          result.status,
          result.conflict ? { conflict: result.conflict } : undefined,
        );
  } catch {
    return failure("ดำเนินการไม่สำเร็จ กรุณาลองใหม่", 500);
  }
}
