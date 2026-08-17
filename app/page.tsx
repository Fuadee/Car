import { BookingApp } from "./booking-app";
import { parseBookingDateParam } from "@/lib/bookings/deep-link";

type HomeProps = {
  searchParams: Promise<{ date?: string | string[] }>;
};

export default async function Home({ searchParams }: HomeProps) {
  const rawDate = (await searchParams).date;
  const initialDate = parseBookingDateParam(
    Array.isArray(rawDate) ? rawDate[0] : rawDate,
  );
  return <BookingApp initialDate={initialDate ?? undefined} />;
}
