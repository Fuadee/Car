"use client";

import { useEffect, useMemo, useState } from "react";

export type VehicleBooking = {
  id: string;
  startAt: string;
  endAt: string;
  name: string;
  purpose: string;
  location: string;
  note?: string | null;
  status: "confirmed" | "active" | "completed" | "cancelled";
  updatedAt: string;
};
type Props = {
  bookings: VehicleBooking[];
  initialMonth: Date;
  today: Date;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onRangeChange: (start: string, end: string) => void;
  onBook: (date?: string, startTime?: string) => void;
  onEvent: (booking: VehicleBooking) => void;
};

const weekdays = [
  "อาทิตย์",
  "จันทร์",
  "อังคาร",
  "พุธ",
  "พฤหัสบดี",
  "ศุกร์",
  "เสาร์",
];
const pad = (value: number) => String(value).padStart(2, "0");
const keyOf = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const bangkokParts = (iso: string) =>
  Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Bangkok",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(new Date(iso))
      .map((part) => [part.type, part.value]),
  );
const datePart = (iso: string) => {
  const parts = bangkokParts(iso);
  return `${parts.year}-${parts.month}-${parts.day}`;
};
const timePart = (iso: string) => {
  const parts = bangkokParts(iso);
  return `${parts.hour}:${parts.minute}`;
};
const addDays = (date: Date, amount: number) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + amount);
const dayBounds = (day: string) => {
  const start = new Date(`${day}T00:00:00+07:00`).getTime();
  return { start, end: start + 86_400_000 };
};
const bookingsOn = (bookings: VehicleBooking[], day: string) => {
  const bounds = dayBounds(day);
  return bookings.filter((booking) =>
    booking.status !== "cancelled" &&
    new Date(booking.startAt).getTime() < bounds.end &&
    new Date(booking.endAt).getTime() > bounds.start,
  );
};
const coversWholeDay = (entries: VehicleBooking[], day: string) => {
  const bounds = dayBounds(day);
  const intervals = entries
    .map((entry) => ({
      start: Math.max(bounds.start, new Date(entry.startAt).getTime()),
      end: Math.min(bounds.end, new Date(entry.endAt).getTime()),
    }))
    .sort((a, b) => a.start - b.start);
  if (!intervals.length || intervals[0].start > bounds.start) return false;
  let coveredUntil = intervals[0].end;
  for (const interval of intervals.slice(1)) {
    if (interval.start > coveredUntil) return false;
    coveredUntil = Math.max(coveredUntil, interval.end);
  }
  return coveredUntil >= bounds.end;
};

export function CalendarMonth({
  bookings,
  initialMonth,
  today,
  loading,
  error,
  onRetry,
  onRangeChange,
  onBook,
  onEvent,
}: Props) {
  const [month, setMonth] = useState(
    new Date(initialMonth.getFullYear(), initialMonth.getMonth(), 1),
  );
  const [selected, setSelected] = useState(keyOf(today));
  const [dayPanel, setDayPanel] = useState(false);
  const days = useMemo(() => {
    const first = new Date(month.getFullYear(), month.getMonth(), 1);
    const start = addDays(first, -first.getDay());
    return Array.from({ length: 42 }, (_, index) => addDays(start, index));
  }, [month]);
  useEffect(() => {
    const start = new Date(days[0]);
    const end = addDays(days[days.length - 1], 1);
    onRangeChange(start.toISOString(), end.toISOString());
  }, [days, onRangeChange]);
  const selectedBookings = bookingsOn(bookings, selected).sort((a, b) =>
    a.startAt.localeCompare(b.startAt),
  );
  const monthLabel = new Intl.DateTimeFormat("th-TH", {
    month: "long",
    year: "numeric",
    timeZone: "Asia/Bangkok",
  }).format(month);
  const selectedLabel = new Intl.DateTimeFormat("th-TH", {
    weekday: "long",
    day: "numeric",
    month: "long",
    timeZone: "Asia/Bangkok",
  }).format(new Date(`${selected}T12:00:00+07:00`));

  const chooseDay = (day: string) => {
    setSelected(day);
    const entries = bookingsOn(bookings, day);
    if (!entries.length) onBook(day);
    else setDayPanel(true);
  };

  return (
    <section className="calendarSection">
      <div className="calendarHeader">
        <div>
          <p className="eyebrow">วางแผนการใช้รถ</p>
          <h2>ปฏิทินการใช้รถ</h2>
        </div>
        <div className="calendarControls">
          <button
            className="todayButton"
            onClick={() => {
              setMonth(new Date(today.getFullYear(), today.getMonth(), 1));
              setSelected(keyOf(today));
            }}
          >
            วันนี้
          </button>
          <button
            aria-label="เดือนก่อน"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))
            }
          >
            ‹
          </button>
          <strong>{monthLabel}</strong>
          <button
            aria-label="เดือนถัดไป"
            onClick={() =>
              setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))
            }
          >
            ›
          </button>
        </div>
      </div>
      <div className="calendarToolbar">
        <div className="calendarLegend">
          <span>
            <i className="available" /> ว่าง
          </span>
          <span>
            <i className="partial" /> ยังมีเวลาว่าง
          </span>
          <span>
            <i className="inUse" /> ใช้งานอยู่
          </span>
          <span>
            <i className="full" /> เต็มทั้งวัน
          </span>
        </div>
        <select aria-label="กรองรถ">
          <option>รถยนต์ส่วนกลาง</option>
        </select>
      </div>
      <div
        className="monthGrid"
        role="grid"
        aria-label={`ปฏิทิน ${monthLabel}`}
      >
        {loading && (
          <div className="calendarState" role="status">
            กำลังโหลดตารางการใช้รถ…
          </div>
        )}
        {error && (
          <div className="calendarState calendarError" role="alert">
            <span>{error}</span>
            <button onClick={onRetry}>ลองใหม่</button>
          </div>
        )}
        {weekdays.map((day) => (
          <div className="weekday" role="columnheader" key={day}>
            {day}
            <span>{day.slice(0, 1)}</span>
          </div>
        ))}
        {days.map((day) => {
          const key = keyOf(day);
          const entries = bookingsOn(bookings, key);
          const inMonth = day.getMonth() === month.getMonth();
          const isToday = key === keyOf(today);
          const isSelected = key === selected;
          const hasActive = entries.some(
            (entry) =>
              entry.status === "confirmed" &&
              new Date(entry.startAt) <= today &&
              new Date(entry.endAt) > today,
          );
          const status = !entries.length
            ? "available"
            : coversWholeDay(entries, key)
              ? "full"
              : "partial";
          const dayStatus = hasActive ? "inUse" : status;
          const statusLabel =
            dayStatus === "inUse"
              ? "ใช้งานอยู่"
              : dayStatus === "available"
                ? "ว่างทั้งวัน"
                : dayStatus === "partial"
                  ? "ยังมีเวลาว่าง"
                  : "เต็มทั้งวัน";
          return (
            <button
              type="button"
              role="gridcell"
              aria-label={`${key} ${statusLabel}${entries.length ? `, ${entries.length} รายการ` : ""}`}
              className={`calendarDay status-${dayStatus} ${inMonth ? "" : "outside"} ${isToday ? "isToday" : ""} ${isSelected ? "isSelected" : ""}`}
              key={key}
              onClick={() => chooseDay(key)}
            >
              <span className="dayNumber">{day.getDate()}</span>
              <span className={`dayBadge ${dayStatus}`}>
                {statusLabel}
              </span>
              <span className="dayEvents">
                {entries.slice(0, 2).map((entry) => {
                  const start = datePart(entry.startAt) === key;
                  const end = datePart(entry.endAt) === key;
                  return (
                    <span
                      key={entry.id}
                      title={`${entry.name} · ${entry.purpose} · ${timePart(entry.startAt)}–${timePart(entry.endAt)}`}
                      className={`calendarEvent ${entry.status} ${start ? "eventStart" : "eventMiddle"} ${end ? "eventEnd" : ""}`}
                      onClick={(event) => {
                        event.stopPropagation();
                        onEvent(entry);
                      }}
                    >
                      {start
                        ? `${timePart(entry.startAt)} ${entry.name}`
                        : end
                          ? `คืนรถ ${timePart(entry.endAt)}`
                          : entry.purpose}
                    </span>
                  );
                })}
                {entries.length > 2 && (
                  <span className="eventMore">
                    +{entries.length - 2} รายการ
                  </span>
                )}
              </span>
            </button>
          );
        })}
      </div>
      <div className="mobileDayAgenda">
        <div>
          <p className="eyebrow">วันที่เลือก</p>
          <h3>{selectedLabel}</h3>
        </div>
        {selectedBookings.map((booking) => (
          <button key={booking.id} onClick={() => onEvent(booking)}>
            <span>
              {datePart(booking.startAt) === selected
                ? timePart(booking.startAt)
                : "ต่อเนื่อง"}
            </span>
            <strong>{booking.purpose}</strong>
            <small>{booking.name}</small>
          </button>
        ))}
        {!selectedBookings.length && <p>วันนี้ว่างทั้งวัน</p>}
        <button className="primary" onClick={() => onBook(selected)}>
          ＋ จองช่วงเวลาว่าง
        </button>
      </div>
      {dayPanel && (
        <div
          className="dayPanelOverlay"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setDayPanel(false)
          }
        >
          <aside className="dayPanel">
            <button className="close" onClick={() => setDayPanel(false)}>
              ×
            </button>
            <p className="eyebrow">ตารางรายวัน</p>
            <h2>{selectedLabel}</h2>
            <div className="daySlots">
              {selectedBookings.map((booking) => (
                <button key={booking.id} onClick={() => onEvent(booking)}>
                  <span>
                    {datePart(booking.startAt) === selected
                      ? timePart(booking.startAt)
                      : "00:00"}
                    –
                    {datePart(booking.endAt) === selected
                      ? timePart(booking.endAt)
                      : "24:00"}
                  </span>
                  <div>
                    <strong>{booking.name}</strong>
                    <small>{booking.purpose}</small>
                  </div>
                </button>
              ))}
              <div className="freeSlot">
                <span>17:00–18:00</span>
                <div>
                  <strong>ว่าง</strong>
                  <small>จองช่วงเวลานี้ได้</small>
                </div>
              </div>
            </div>
            <button
              className="primary"
              onClick={() => {
                setDayPanel(false);
                onBook(selected, "17:00");
              }}
            >
              ＋ จองช่วงเวลาว่าง
            </button>
          </aside>
        </div>
      )}
    </section>
  );
}
