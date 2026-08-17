"use client";

import {
  FormEvent,
  MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Car } from "lucide-react";
import { CalendarMonth, type VehicleBooking } from "./calendar-month";

const pad = (value: number) => String(value).padStart(2, "0");
const dateKey = (date: Date) =>
  `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const displayDate = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", {
    day: "numeric",
    month: "short",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
const displayTime = (iso: string) =>
  new Intl.DateTimeFormat("th-TH", {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZone: "Asia/Bangkok",
  }).format(new Date(iso));
const bangkokParts = (iso: string) => {
  const parts = new Intl.DateTimeFormat("en-CA", {
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit",
    minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok",
  }).formatToParts(new Date(iso));
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return { date: `${value("year")}-${value("month")}-${value("day")}`, time: `${value("hour")}:${value("minute")}` };
};

type ManagedBooking = Omit<VehicleBooking, "location"> & { destination: string; note: string };
type BookingConflict = {
  message: string;
  startAt: string | null;
  endAt: string | null;
};

function ManageBookingIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M8 3v3m8-3v3M4.5 9h15M6 5.5h12a1.5 1.5 0 0 1 1.5 1.5v11A1.5 1.5 0 0 1 18 19.5H6A1.5 1.5 0 0 1 4.5 18V7A1.5 1.5 0 0 1 6 5.5Z" />
      <path d="m10.5 15 1.5 1.5 3-3" />
    </svg>
  );
}

const conflictFallbackMessage =
  "ช่วงเวลาที่เลือกมีผู้จองแล้ว กรุณาเลือกวันหรือเวลาใหม่";

export function BookingApp({ initialDate }: { initialDate?: string }) {
  const today = useMemo(() => new Date(), []);
  const calendarInitialDate = useMemo(() => {
    if (!initialDate) return today;
    const [year, month, day] = initialDate.split("-").map(Number);
    return new Date(year, month - 1, day);
  }, [initialDate, today]);
  const [bookings, setBookings] = useState<VehicleBooking[]>([]);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [calendarError, setCalendarError] = useState("");
  const currentRange = useRef({ start: "", end: "" });
  const requestSequence = useRef(0);
  const [open, setOpen] = useState(false);
  const [manageOpen, setManageOpen] = useState(false);
  const [bookingCode, setBookingCode] = useState("");
  const [manageError, setManageError] = useState("");
  const [managed, setManaged] = useState<ManagedBooking | null>(null);
  const [editContext, setEditContext] = useState<{ id: string; bookingCode: string; updatedAt: string } | null>(null);
  const [cancelConfirm, setCancelConfirm] = useState(false);
  const [success, setSuccess] = useState<{
    code: string;
    booking: VehicleBooking;
  } | null>(null);
  const [copyStatus, setCopyStatus] = useState("");
  const [detail, setDetail] = useState<VehicleBooking | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [timeConflict, setTimeConflict] = useState<BookingConflict | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const manageCodeInputRef = useRef<HTMLInputElement | null>(null);
  const manageTriggerRef = useRef<HTMLButtonElement | null>(null);
  const [form, setForm] = useState({
    name: "",
    startDate: dateKey(today),
    startTime: "",
    endDate: dateKey(today),
    endTime: "",
    purpose: "",
    location: "",
    note: "",
  });

  const activeBooking = useMemo(
    () =>
      bookings.find(
        (booking) =>
          new Date(booking.startAt) <= today &&
          new Date(booking.endAt) > today &&
          booking.status === "confirmed",
      ),
    [bookings, today],
  );
  const nextBooking = useMemo(
    () => bookings.filter((booking) => booking.status === "confirmed" && new Date(booking.startAt) > today).sort((a, b) => a.startAt.localeCompare(b.startAt))[0],
    [bookings, today],
  );
  const remainingLabel = activeBooking ? (() => {
    const hours = Math.max(0, Math.ceil((new Date(activeBooking.endAt).getTime() - today.getTime()) / 3_600_000));
    const days = Math.floor(hours / 24); const rest = hours % 24;
    return `${days ? `${days} วัน ` : ""}${rest} ชั่วโมง`;
  })() : "รถพร้อมใช้งาน";
  const todayLabel = new Intl.DateTimeFormat("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: "Asia/Bangkok" }).format(today);
  const loadBookings = useCallback(async (start: string, end: string) => {
    currentRange.current = { start, end };
    const sequence = ++requestSequence.current;
    setCalendarLoading(true);
    setCalendarError("");
    try {
      const response = await fetch(
        `/api/bookings?start=${encodeURIComponent(start)}&end=${encodeURIComponent(end)}`,
        { cache: "no-store" },
      );
      const result = (await response.json()) as {
        bookings?: VehicleBooking[];
        message?: string;
      };
      if (sequence !== requestSequence.current) return;
      if (!response.ok) throw new Error(result.message);
      setBookings(result.bookings ?? []);
    } catch (reason) {
      if (sequence === requestSequence.current)
        setCalendarError(
          reason instanceof Error ? reason.message : "ไม่สามารถโหลดปฏิทินได้",
        );
    } finally {
      if (sequence === requestSequence.current) setCalendarLoading(false);
    }
  }, []);
  const refresh = useCallback(() => {
    const { start, end } = currentRange.current;
    if (start && end) void loadBookings(start, end);
  }, [loadBookings]);
  useEffect(() => {
    const timer = window.setInterval(refresh, 30_000);
    return () => window.clearInterval(timer);
  }, [refresh]);
  useEffect(() => {
    if (!manageOpen || managed) return;

    const frame = window.requestAnimationFrame(() => manageCodeInputRef.current?.focus());
    return () => window.cancelAnimationFrame(frame);
  }, [manageOpen, managed]);
  function openManageBooking(event: MouseEvent<HTMLButtonElement>) {
    manageTriggerRef.current = event.currentTarget;
    setManaged(null);
    setManageError("");
    setBookingCode("");
    setManageOpen(true);
  }
  function closeManageBooking() {
    setManageOpen(false);
    window.requestAnimationFrame(() => manageTriggerRef.current?.focus());
  }
  const setField = (key: keyof typeof form, value: string) =>
    setForm((current) => ({ ...current, [key]: value }));
  const setScheduleField = (
    key: "startDate" | "startTime" | "endDate" | "endTime",
    value: string,
  ) => {
    setField(key, value);
    setError("");
    setTimeConflict(null);
  };
  const startBooking = (date = dateKey(today), startTime = "") => {
    setEditContext(null);
    setForm((current) => ({
      ...current,
      startDate: date,
      endDate: date,
      startTime,
      endTime: "",
    }));
    setError("");
    setTimeConflict(null);
    setOpen(true);
  };

  async function lookupBooking(event: FormEvent) {
    event.preventDefault();
    if (bookingCode.length !== 6)
      return setManageError("กรุณากรอกรหัสการจองให้ครบ 6 หลัก");
    setManageError(""); setBusy(true);
    try {
      const response = await fetch("/api/bookings/manage", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingCode }) });
      const result = await response.json() as { message?: string; booking?: ManagedBooking };
      if (!response.ok || !result.booking) return setManageError(result.message ?? "ไม่พบการจอง");
      setManaged(result.booking);
    } catch { setManageError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้"); } finally { setBusy(false); }
  }

  function beginEdit() {
    if (!managed) return;
    const start = bangkokParts(managed.startAt); const end = bangkokParts(managed.endAt);
    setForm({ name: managed.name, startDate: start.date, startTime: start.time, endDate: end.date, endTime: end.time, purpose: managed.purpose, location: managed.destination, note: managed.note });
    setEditContext({ id: managed.id, bookingCode, updatedAt: managed.updatedAt });
    setManageOpen(false); setError(""); setOpen(true);
  }

  async function cancelManagedBooking() {
    if (!managed) return; setBusy(true); setManageError("");
    try {
      const response = await fetch(`/api/bookings/${managed.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "cancel", bookingCode }) });
      const result = await response.json() as { message?: string };
      if (!response.ok) return setManageError(result.message ?? "ยกเลิกการจองไม่สำเร็จ");
      setCancelConfirm(false); setManaged(null); setManageOpen(false); refresh();
    } catch { setManageError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้"); } finally { setBusy(false); }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setError("");
    if (
      !form.name.trim() ||
      !form.startTime ||
      !form.endTime ||
      !form.purpose.trim() ||
      !form.location.trim()
    )
      return setError("กรุณากรอกข้อมูลที่จำเป็นให้ครบ");
    const startAt = `${form.startDate}T${form.startTime}`;
    const endAt = `${form.endDate}T${form.endTime}`;
    if (endAt <= startAt)
      return setError("วันและเวลาสิ้นสุดต้องอยู่หลังเวลาเริ่ม");
    setBusy(true);
    try {
      const response = await fetch(editContext ? `/api/bookings/${editContext.id}` : "/api/bookings", {
        method: editContext ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.name,
          purpose: form.purpose,
          destination: form.location,
          note: form.note,
          startAt: new Date(`${startAt}:00+07:00`).toISOString(),
          endAt: new Date(`${endAt}:00+07:00`).toISOString(),
          ...(editContext ? { bookingCode: editContext.bookingCode, updatedAt: editContext.updatedAt } : {}),
        }),
      });
      let result: {
        message?: string;
        conflict?: VehicleBooking;
        bookingCode?: string;
        booking?: VehicleBooking;
      };
      try {
        result = (await response.json()) as typeof result;
      } catch {
        result = {};
      }
      if (response.status === 409) {
        setTimeConflict({
          message: result.message ?? conflictFallbackMessage,
          startAt: result.conflict?.startAt ?? null,
          endAt: result.conflict?.endAt ?? null,
        });
        return;
      }
      if (!response.ok)
        return setError(result.message ?? "ไม่สามารถบันทึกการจองได้");
      if (editContext) { setOpen(false); setEditContext(null); refresh(); return; }
      if (!result.bookingCode || !result.booking)
        throw new Error("INVALID_RESPONSE");
      setOpen(false);
      setCopyStatus("");
      setSuccess({ code: result.bookingCode, booking: result.booking });
      refresh();
    } catch {
      setError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่");
    } finally {
      setBusy(false);
    }
  }

  async function copyBookingCode() {
    if (!success) return;
    try {
      await navigator.clipboard.writeText(success.code);
      setCopyStatus("คัดลอกแล้ว");
    } catch {
      setCopyStatus("ไม่สามารถคัดลอกรหัสได้");
    }
  }

  return (
    <main>
      <header className="topbar">
        <div className="brandMark" aria-hidden="true">
          <Car size={22} />
        </div>
        <div className="brand">
          <strong>ระบบจองรถส่วนกลาง</strong>
          <span>ดูปฏิทินและจองรถล่วงหน้า</span>
        </div>
        <button
          className="manageLink"
          onClick={openManageBooking}
          aria-label="ตรวจสอบ แก้ไข หรือยกเลิกการจอง"
          aria-expanded={manageOpen}
          aria-controls="manage-booking-sheet"
        >
          <ManageBookingIcon />
          <span className="manageLabelFull">จัดการการจอง</span>
          <span className="manageLabelShort">จัดการ</span>
        </button>
      </header>
      <div className="page">
        <section className="intro">
          <div>
            <p className="eyebrow">ภาพรวมวันนี้</p>
            <h1>{todayLabel}</h1>
          </div>
          <button className="outline" onClick={openManageBooking}>
            ⌁ จัดการการจองของฉัน
          </button>
        </section>
        <section
          className={`vehicleCard compactVehicle ${activeBooking ? "isInUse" : "isAvailable"}`}
        >
          <div className="vehicleTop">
            <div className="carIcon">▰</div>
            <div>
              <span className="muted">รถที่ให้บริการ</span>
              <h2>รถยนต์ส่วนกลาง</h2>
              <p>
                ทะเบียน <b>ระบุภายหลัง</b>
              </p>
            </div>
            <span className="status">
              <i /> {activeBooking ? "กำลังใช้งาน" : "พร้อมใช้งาน"}
            </span>
          </div>
          {activeBooking && (
            <div className="current crossDaySummary">
              <div>
                <span>ผู้ใช้งาน</span>
                <strong>{activeBooking.name}</strong>
              </div>
              <div>
                <span>ภารกิจ</span>
                <strong>{activeBooking.purpose}</strong>
              </div>
              <div>
                <span>เริ่มใช้งาน</span>
                <strong>
                  {displayDate(activeBooking.startAt)} ·{" "}
                  {displayTime(activeBooking.startAt)} น.
                </strong>
              </div>
              <div>
                <span>คืนรถ</span>
                <strong>
                  {displayDate(activeBooking.endAt)} ·{" "}
                  {displayTime(activeBooking.endAt)} น.
                </strong>
              </div>
            </div>
          )}
          <div className="vehicleBottom">
            <div className="remaining">
              <span className="clock">◷</span>
              <div>
                <span>เหลือเวลาอีก</span>
                <strong>{remainingLabel}</strong>
              </div>
            </div>
            <div className="next">
              <span className="clock">◷</span>
              <div>
                <span>คิวถัดไป</span>
                <strong>{nextBooking ? `${displayDate(nextBooking.startAt)} ${displayTime(nextBooking.startAt)} น. · ${nextBooking.name}` : "ยังไม่มีคิวถัดไป"}</strong>
              </div>
            </div>
          </div>
          <div className="vehicleActions">
            <button className="primary bookMain" onClick={() => startBooking()}>
              ＋ จองรถ
            </button>
            <button
              className="manageBookingLink"
              onClick={openManageBooking}
              aria-label="ตรวจสอบ แก้ไข หรือยกเลิกการจอง"
              aria-expanded={manageOpen}
              aria-controls="manage-booking-sheet"
            >
              <ManageBookingIcon />
              <span>ตรวจสอบ / แก้ไข / ยกเลิกการจอง</span>
            </button>
          </div>
        </section>

        <CalendarMonth
          bookings={bookings}
          initialMonth={calendarInitialDate}
          today={today}
          loading={calendarLoading}
          error={calendarError}
          onRetry={refresh}
          onRangeChange={loadBookings}
          onBook={startBooking}
          onEvent={setDetail}
        />
        <footer>
          <span>ต้องการความช่วยเหลือ? ติดต่อฝ่ายธุรการ</span>
          <span>อัปเดตล่าสุด วันนี้ 12:05 น.</span>
        </footer>
      </div>
      <button className="floating" onClick={() => startBooking()}>
        ＋ จองรถ
      </button>

      {open && (
        <div
          className="overlay"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setOpen(false)
          }
        >
          <form className="sheet" onSubmit={submit}>
            <div className="sheetHead">
              <div>
                <span>รองรับการจองวันเดียวและหลายวัน</span>
                <h2>{editContext ? "แก้ไขการจอง" : "จองรถส่วนกลาง"}</h2>
              </div>
              <button
                type="button"
                className="close"
                onClick={() => setOpen(false)}
              >
                ×
              </button>
            </div>
            {timeConflict && (
              <div className="conflictBanner" role="alert" aria-live="assertive">
                <div>
                  <strong>ไม่สามารถจองช่วงเวลานี้ได้</strong>
                  <span>{timeConflict.message}</span>
                  {timeConflict.startAt && timeConflict.endAt && (
                    <small>
                      ช่วงเวลาที่ถูกจอง: {displayTime(timeConflict.startAt)}–
                      {displayTime(timeConflict.endAt)} น.
                    </small>
                  )}
                </div>
                <button
                  type="button"
                  className="conflictAction"
                  onClick={() => startTimeRef.current?.focus()}
                >
                  เลือกเวลาใหม่
                </button>
              </div>
            )}
            <div className="formBody">
              <label>
                ชื่อผู้ใช้งาน <em>*</em>
                <input
                  value={form.name}
                  onChange={(event) => setField("name", event.target.value)}
                  placeholder="ชื่อ–นามสกุล"
                />
              </label>
              <div className="formRow">
                <label>
                  วันที่เริ่มต้น <em>*</em>
                  <input
                    type="date"
                    value={form.startDate}
                    onChange={(event) =>
                      setScheduleField("startDate", event.target.value)
                    }
                    className={timeConflict ? "timeConflictField" : undefined}
                    aria-invalid={Boolean(timeConflict)}
                  />
                </label>
                <label>
                  เวลาเริ่ม <em>*</em>
                  <input
                    type="time"
                    value={form.startTime}
                    onChange={(event) =>
                      setScheduleField("startTime", event.target.value)
                    }
                    ref={startTimeRef}
                    className={timeConflict ? "timeConflictField" : undefined}
                    aria-invalid={Boolean(timeConflict)}
                  />
                </label>
              </div>
              <div className="formRow">
                <label>
                  วันที่สิ้นสุด <em>*</em>
                  <input
                    type="date"
                    min={form.startDate}
                    value={form.endDate}
                    onChange={(event) =>
                      setScheduleField("endDate", event.target.value)
                    }
                    className={timeConflict ? "timeConflictField" : undefined}
                    aria-invalid={Boolean(timeConflict)}
                  />
                </label>
                <label>
                  เวลาสิ้นสุด <em>*</em>
                  <input
                    type="time"
                    value={form.endTime}
                    onChange={(event) =>
                      setScheduleField("endTime", event.target.value)
                    }
                    className={timeConflict ? "timeConflictField" : undefined}
                    aria-invalid={Boolean(timeConflict)}
                  />
                </label>
              </div>
              {timeConflict && (
                <div className="timeConflict">
                  <span>โปรดเลือกวันหรือเวลาใหม่</span>
                </div>
              )}
              <label>
                ภารกิจ <em>*</em>
                <input
                  value={form.purpose}
                  onChange={(event) => setField("purpose", event.target.value)}
                  placeholder="เช่น ไปราชการจังหวัดตรัง"
                />
              </label>
              <label>
                สถานที่ <em>*</em>
                <input
                  value={form.location}
                  onChange={(event) => setField("location", event.target.value)}
                  placeholder="ปลายทางหรือสถานที่ปฏิบัติงาน"
                />
              </label>
              <label>
                หมายเหตุ <small>(ไม่บังคับ)</small>
                <textarea
                  value={form.note}
                  onChange={(event) => setField("note", event.target.value)}
                  placeholder="ข้อมูลเพิ่มเติม"
                />
              </label>
              {error && <p className="formError">! {error}</p>}
            </div>
            <div className="sheetFoot">
              <button
                type="button"
                className="cancel"
                onClick={() => setOpen(false)}
              >
                ยกเลิก
              </button>
              <button className="primary" disabled={busy} aria-busy={busy}>
                {busy && <span className="buttonSpinner" aria-hidden="true" />}
                {busy ? "กำลังตรวจสอบ..." : editContext ? "บันทึกการแก้ไข" : "ยืนยันการจอง"}
              </button>
            </div>
          </form>
        </div>
      )}

      {detail && (
        <div
          className="overlay"
          onMouseDown={(event) =>
            event.target === event.currentTarget && setDetail(null)
          }
        >
          <section className="dialog bookingDetail">
            <button className="close" onClick={() => setDetail(null)}>
              ×
            </button>
            <p className="eyebrow">รายละเอียดการจอง</p>
            <h2>{detail.purpose || "ไม่ระบุ"}</h2>
            <dl>
              <div>
                <dt>ผู้ใช้งาน</dt>
                <dd>{detail.name}</dd>
              </div>
              <div>
                <dt>เริ่มใช้งาน</dt>
                <dd>
                  {displayDate(detail.startAt)} · {displayTime(detail.startAt)}{" "}
                  น.
                </dd>
              </div>
              <div>
                <dt>คืนรถ</dt>
                <dd>
                  {displayDate(detail.endAt)} · {displayTime(detail.endAt)} น.
                </dd>
              </div>
              <div>
                <dt>ภารกิจ</dt>
                <dd>{detail.purpose || "ไม่ระบุ"}</dd>
              </div>
              <div>
                <dt>สถานที่</dt>
                <dd>{detail.location}</dd>
              </div>
              {detail.note && (
                <div>
                  <dt>หมายเหตุ</dt>
                  <dd>{detail.note}</dd>
                </div>
              )}
            </dl>
            <button className="primary" onClick={() => setDetail(null)}>
              ปิดรายละเอียด
            </button>
          </section>
        </div>
      )}
      {success && (
        <div className="overlay">
          <section className="dialog success">
            <div className="successIcon">✓</div>
            <h2>จองรถสำเร็จ</h2>
            <p>ปฏิทินได้รับการอัปเดตแล้ว</p>
            <div className="receipt">
              <span>รหัสการจอง</span>
              <strong className="code">{success.code}</strong>
              <span>รถที่จอง</span>
              <strong>รถยนต์ส่วนกลาง</strong>
              <span>ผู้จอง</span>
              <strong>{success.booking.name}</strong>
              <span>ช่วงเวลา</span>
              <strong>{displayDate(success.booking.startAt)} {displayTime(success.booking.startAt)} – {displayDate(success.booking.endAt)} {displayTime(success.booking.endAt)}</strong>
            </div>
            <p className="warning">ใช้รหัสนี้สำหรับตรวจสอบ แก้ไข หรือยกเลิกการจอง</p>
            <div className="successActions">
              <button className="cancel" onClick={copyBookingCode}>คัดลอกรหัส</button>
              {copyStatus && <p className="warning">{copyStatus}</p>}
              <button className="primary" onClick={() => { setSuccess(null); setCopyStatus(""); }}>
                กลับหน้าปฏิทิน
              </button>
            </div>
          </section>
        </div>
      )}
      {manageOpen && (
        <div
          className="overlay"
          onMouseDown={(event) =>
            event.target === event.currentTarget && closeManageBooking()
          }
        >
          <form className="dialog manage" id="manage-booking-sheet" role="dialog" aria-modal="true" aria-labelledby="manage-booking-title" onSubmit={lookupBooking}>
            <button type="button" className="close" aria-label="ปิดหน้าจัดการการจอง" onClick={closeManageBooking}>
              ×
            </button>
            <p className="eyebrow">สำหรับผู้ที่จองแล้ว</p>
            <h2 id="manage-booking-title">จัดการการจอง</h2>
            <p>กรอกรหัสการจอง 6 หลัก เพื่อตรวจสอบ แก้ไข หรือยกเลิกการจอง</p>
            {!managed ? <>
              <label>
                รหัสการจอง 6 หลัก
                <input ref={manageCodeInputRef} value={bookingCode} onChange={(event) => setBookingCode(event.target.value.replace(/\D/g, ""))} inputMode="numeric" maxLength={6} autoComplete="off" placeholder="เช่น 389418" />
              </label>
              {manageError && <p className="formError">! {manageError}</p>}
              <button className="primary" disabled={busy || bookingCode.length !== 6}>{busy ? "กำลังตรวจสอบ…" : "ตรวจสอบการจอง"}</button>
            </> : <>
              <div className="receipt"><span>รถที่จอง</span><strong>รถยนต์ส่วนกลาง</strong><span>ผู้จอง</span><strong>{managed.name}</strong><span>ภารกิจ</span><strong>{managed.purpose || "ไม่ระบุ"}</strong><span>สถานที่</span><strong>{managed.destination || "ไม่ระบุ"}</strong><span>ช่วงเวลา</span><strong>{displayDate(managed.startAt)} {displayTime(managed.startAt)} – {displayDate(managed.endAt)} {displayTime(managed.endAt)}</strong><span>สถานะ</span><strong>{managed.status === "cancelled" ? "ยกเลิกแล้ว" : "ยืนยันการจอง"}</strong></div>
              {manageError && <p className="formError">! {manageError}</p>}
              <button type="button" className="primary" onClick={beginEdit} disabled={managed.status === "cancelled"}>แก้ไขการจอง</button>
              <button type="button" className="cancel" onClick={() => setCancelConfirm(true)} disabled={managed.status === "cancelled"}>ยกเลิกการจอง</button>
            </>}
            <button type="button" className="cancel manageBackButton" onClick={() => { setManaged(null); setManageError(""); setBookingCode(""); closeManageBooking(); }}>
              กลับหน้าหลัก
            </button>
          </form>
        </div>
      )}
      {cancelConfirm && managed && (
        <div className="overlay">
          <section className="dialog">
            <h2>ยืนยันยกเลิกการจอง?</h2>
            <p>ช่วงเวลานี้จะกลับมาเปิดให้ผู้อื่นจองได้</p>
            {manageError && <p className="formError">! {manageError}</p>}
            <div className="cancelDialogActions">
              <button className="primary" onClick={cancelManagedBooking} disabled={busy}>{busy ? "กำลังยกเลิก…" : "ยืนยันยกเลิก"}</button>
              <button className="cancel" onClick={() => setCancelConfirm(false)} disabled={busy}>กลับ</button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
