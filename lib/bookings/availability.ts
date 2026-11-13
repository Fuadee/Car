type TimedBooking = { startAt: string; endAt: string; actualReturnAt?: string | null; status: string };
export const effectiveEnd = (booking: Pick<TimedBooking, "endAt" | "actualReturnAt">) => booking.actualReturnAt ?? booking.endAt;
export const isActiveBooking = (booking: TimedBooking, now: Date) =>
  booking.status === "confirmed" && new Date(booking.startAt) <= now && new Date(effectiveEnd(booking)) > now;
export const canRequestEarlyReturn = (booking: TimedBooking, now: Date, pending = false) =>
  isActiveBooking(booking, now) && !booking.actualReturnAt && !pending;
