import { NextRequest, NextResponse } from "next/server";
import { supabaseAdminRequest } from "@/lib/supabase/admin";
import type { BookingRow } from "@/lib/bookings/types";

async function hashCode(code: string) {
  const secret = process.env.ADMIN_SESSION_SECRET;
  if (!secret) throw new Error("MANAGEMENT_SECRET_NOT_CONFIGURED");
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const bytes = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(code),
  );
  return Array.from(new Uint8Array(bytes), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>;
    const reference = String(body.reference ?? "")
      .trim()
      .toUpperCase();
    const code = String(body.managementCode ?? "");
    if (!/^CAR-\d{8}-[A-Z0-9]{4}$/.test(reference) || !/^\d{6}$/.test(code))
      return NextResponse.json(
        { ok: false, message: "รูปแบบเลขอ้างอิงหรือรหัสไม่ถูกต้อง" },
        { status: 400 },
      );
    const params = new URLSearchParams({
      select: "*",
      booking_reference: `eq.${reference}`,
      limit: "1",
    });
    const response = await supabaseAdminRequest(`vehicle_bookings?${params}`);
    const row = ((await response.json()) as BookingRow[])[0];
    if (!row || row.management_code_hash !== (await hashCode(code)))
      return NextResponse.json(
        { ok: false, message: "เลขอ้างอิงหรือรหัสจัดการไม่ถูกต้อง" },
        { status: 403 },
      );
    return NextResponse.json({
      ok: true,
      booking: {
        id: row.id,
        startAt: row.start_time,
        endAt: row.end_time,
        name: row.booker_name,
        phone: row.phone ?? "",
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
