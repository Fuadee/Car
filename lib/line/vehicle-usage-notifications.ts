import type { VehicleUsageRequest } from "../vehicle-usage-requests/types";
import { sendLinePushMessage } from "./client";

const TIME_ZONE = "Asia/Bangkok";
const dateFormatter = new Intl.DateTimeFormat("th-TH", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: TIME_ZONE,
});
const timeFormatter = new Intl.DateTimeFormat("th-TH", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: TIME_ZONE,
});

const managerRequestUrl = (appBaseUrl: string, requestId: string) => {
  try {
    const url = new URL("/vehicle-usage", appBaseUrl);
    url.searchParams.set("request", requestId);
    return url.toString();
  } catch {
    return null;
  }
};

export async function notifyManagerVehicleUsageRequestCreated(
  request: VehicleUsageRequest,
) {
  const managerLineUserId = process.env.MANAGER_LINE_USER_ID?.trim();
  const appBaseUrl = process.env.APP_BASE_URL?.trim();
  if (!managerLineUserId || !appBaseUrl) {
    console.warn("LINE manager notification skipped: configuration is incomplete", {
      requestId: request.id,
    });
    return false;
  }
  const url = managerRequestUrl(appBaseUrl, request.id);
  if (!url) {
    console.warn("LINE manager notification skipped: APP_BASE_URL is invalid", {
      requestId: request.id,
    });
    return false;
  }
  const date = dateFormatter.format(new Date(request.startAt));
  const time = `${timeFormatter.format(new Date(request.startAt))}–${timeFormatter.format(new Date(request.endAt))} น.`;
  return sendLinePushMessage([
    {
      type: "flex",
      altText: "มีคำขอใช้รถใหม่ รออนุมัติ",
      contents: {
        type: "bubble",
        body: {
          type: "box",
          layout: "vertical",
          contents: [
            { type: "text", text: "🚗 มีคำขอใช้รถใหม่", weight: "bold", size: "lg" },
            { type: "text", text: "🟡 รออนุมัติ", color: "#A16207", margin: "md" },
            { type: "separator", margin: "lg" },
            { type: "text", text: `ผู้ขอ: ${request.name}`, wrap: true, margin: "lg" },
            { type: "text", text: `ภารกิจ: ${request.purpose}`, wrap: true, margin: "sm" },
            { type: "text", text: `สถานที่: ${request.destination}`, wrap: true, margin: "sm" },
            { type: "text", text: `วันที่: ${date}`, wrap: true, margin: "sm" },
            { type: "text", text: `เวลา: ${time}`, wrap: true, margin: "sm" },
          ],
        },
        footer: {
          type: "box",
          layout: "vertical",
          contents: [
            {
              type: "button",
              style: "primary",
              action: { type: "uri", label: "ตรวจสอบคำขอ", uri: url },
            },
          ],
        },
      },
    },
  ], managerLineUserId);
}
