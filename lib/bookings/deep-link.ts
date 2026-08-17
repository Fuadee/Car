const DATE_PARAM = /^(\d{4})-(\d{2})-(\d{2})$/;

/** Returns a canonical YYYY-MM-DD value only when it is a real calendar day. */
export function parseBookingDateParam(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const match = DATE_PARAM.exec(value);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
    ? value
    : null;
}
