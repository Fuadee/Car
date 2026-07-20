import type { BookingInput } from "./types";

const clean = (value: unknown, max: number) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

export function validateBookingInput(
  value: unknown,
):
  | { ok: true; data: BookingInput; start: Date; end: Date }
  | { ok: false; message: string } {
  if (!value || typeof value !== "object")
    return { ok: false, message: "ข้อมูลการจองไม่ถูกต้อง" };
  const input = value as Record<string, unknown>;
  const data: BookingInput = {
    name: clean(input.name, 120),
    phone: clean(input.phone, 30),
    purpose: clean(input.purpose, 240),
    destination: clean(input.destination ?? input.location, 240),
    note: clean(input.note, 1000),
    startAt: clean(input.startAt, 40),
    endAt: clean(input.endAt, 40),
  };
  if (
    !data.name ||
    !data.purpose ||
    !data.destination ||
    !data.startAt ||
    !data.endAt
  )
    return { ok: false, message: "กรุณากรอกข้อมูลที่จำเป็นให้ครบ" };
  const start = new Date(data.startAt);
  const end = new Date(data.endAt);
  if (
    !Number.isFinite(start.getTime()) ||
    !Number.isFinite(end.getTime()) ||
    end <= start
  )
    return { ok: false, message: "วันและเวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม" };
  if (start.getTime() < Date.now() - 60_000)
    return { ok: false, message: "ไม่สามารถจองวันเวลาที่ผ่านมาแล้ว" };
  const maxHours = Number(process.env.MAX_BOOKING_HOURS ?? 168);
  if ((end.getTime() - start.getTime()) / 3_600_000 > maxHours)
    return { ok: false, message: `จองได้ไม่เกิน ${maxHours} ชั่วโมงต่อรายการ` };
  return { ok: true, data, start, end };
}

export function validRange(start: string | null, end: string | null) {
  if (!start || !end) return null;
  const from = new Date(start);
  const to = new Date(end);
  return Number.isFinite(from.getTime()) &&
    Number.isFinite(to.getTime()) &&
    to > from
    ? { from, to }
    : null;
}
