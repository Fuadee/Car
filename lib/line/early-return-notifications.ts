import type { PublicBooking } from "../bookings/types";
import type { EarlyReturnRequest } from "../early-returns/types";
import { sendLinePushMessage } from "./client";

export async function notifyManagerEarlyReturn(request: EarlyReturnRequest, booking: PublicBooking) {
  const recipient = process.env.MANAGER_LINE_USER_ID?.trim();
  const base = process.env.APP_BASE_URL?.trim();
  if (!recipient || !base) return false;
  let url: URL;
  try { url = new URL("/vehicle-usage", base); } catch { return false; }
  url.searchParams.set("returnRequest", request.id);
  const format = (iso: string) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
  return sendLinePushMessage([{
    type: "flex", altText: "🚗 มีการแจ้งคืนรถก่อนกำหนด รอหัวหน้ายืนยัน",
    contents: { type: "bubble", body: { type: "box", layout: "vertical", contents: [
      { type: "text", text: "🚗 มีการแจ้งคืนรถก่อนกำหนด", weight: "bold", wrap: true },
      ...[`ผู้ใช้: ${booking.name}`, `ภารกิจ: ${booking.purpose}`, `เดิมใช้ถึง: ${format(booking.endAt)} น.`, `แจ้งคืน: ${format(request.requested_at)} น.`, "🟠 รอยืนยันคืนรถ"].map(text => ({ type: "text", text, wrap: true, margin: "md" })),
    ] }, footer: { type: "box", layout: "vertical", contents: [{ type: "button", style: "primary", action: { type: "uri", label: "ตรวจสอบ", uri: url.toString() } }] } },
  }], recipient);
}
