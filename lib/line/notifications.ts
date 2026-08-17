import type { PublicBooking } from "../bookings/types";
import { sendLinePushMessage } from "./client";

const TIME_ZONE = "Asia/Bangkok";

export type VehicleDetails = {
  name?: string | null;
  license_plate?: string | null;
};

const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const timeFormatter = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});
const dateKeyFormatter = new Intl.DateTimeFormat("en-CA", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  timeZone: TIME_ZONE,
});

const bookingDateLine = (booking: PublicBooking) => {
  const start = dateFormatter.format(new Date(booking.startAt));
  const end = dateFormatter.format(new Date(booking.endAt));
  return start === end ? start : `${start} - ${end}`;
};

const bookingTimeLine = (booking: PublicBooking) =>
  `${timeFormatter.format(new Date(booking.startAt))} - ${timeFormatter.format(new Date(booking.endAt))} น.`;

const vehicleLabel = (vehicle?: VehicleDetails | null) => {
  const values = [vehicle?.name?.trim(), vehicle?.license_plate?.trim()].filter(
    (value): value is string => Boolean(value),
  );
  return [...new Set(values)].join(" / ");
};

export function buildBookingAppUrl(startAt: string): string | null {
  const appUrl = process.env.APP_URL?.trim();
  if (!appUrl) {
    console.warn("LINE notification link omitted: APP_URL is not configured");
    return null;
  }
  try {
    const url = new URL(appUrl);
    url.searchParams.set("date", dateKeyFormatter.format(new Date(startAt)));
    return url.toString();
  } catch {
    console.warn("LINE notification link omitted: APP_URL is invalid");
    return null;
  }
}

export function bookingCreatedText(
  booking: PublicBooking,
  vehicle?: VehicleDetails | null,
) {
  const link = buildBookingAppUrl(booking.startAt);
  const vehicleText = vehicleLabel(vehicle);
  return [
    "🚗 มีการจองรถใหม่",
    "",
    booking.name?.trim() ? `👤 ${booking.name.trim()}` : null,
    `📅 ${bookingDateLine(booking)}`,
    `⏰ ${bookingTimeLine(booking)}`,
    booking.purpose?.trim() ? `📍 ${booking.purpose.trim()}` : null,
    vehicleText ? `🚙 ${vehicleText}` : null,
    link ? "" : null,
    link ? "🔗 ดูตารางรถ / จองรถ" : null,
    link,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export function bookingCancelledText(
  booking: PublicBooking,
  vehicle?: VehicleDetails | null,
) {
  const link = buildBookingAppUrl(booking.startAt);
  const vehicleText = vehicleLabel(vehicle);
  return [
    "✅ มีช่วงเวลารถว่างเพิ่มแล้ว",
    "",
    vehicleText ? `🚙 ${vehicleText}` : null,
    `📅 ${bookingDateLine(booking)}`,
    `⏰ ${bookingTimeLine(booking)}`,
    "",
    "การจองช่วงเวลาดังกล่าวถูกยกเลิกแล้ว",
    link ? "" : null,
    link ? "🔗 ตรวจสอบรถว่าง / จองรถ" : null,
    link,
  ]
    .filter((line): line is string => line !== null)
    .join("\n");
}

export const notifyBookingCreated = (
  booking: PublicBooking,
  vehicle?: VehicleDetails | null,
) =>
  sendLinePushMessage([
    { type: "text", text: bookingCreatedText(booking, vehicle) },
  ]);

export const notifyBookingCancelled = (
  booking: PublicBooking,
  vehicle?: VehicleDetails | null,
) =>
  sendLinePushMessage([
    { type: "text", text: bookingCancelledText(booking, vehicle) },
  ]);
