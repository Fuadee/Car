"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Car } from "lucide-react";
import { canRequestEarlyReturn } from "@/lib/bookings/availability";
import type { VehicleBooking } from "./calendar-month";
import type { EarlyReturnRequest } from "@/lib/early-returns/types";

const time = (iso: string) => new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(iso));
export function EarlyReturnAction({ booking, now, onChange }: { booking: VehicleBooking; now: Date; onChange: () => void }) {
  const [pending, setPending] = useState<EarlyReturnRequest | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const read = useCallback(async () => {
    const response = await fetch(`/api/early-returns?bookingId=${booking.id}`, { cache: "no-store" });
    if (!response.ok) throw new Error("ไม่สามารถตรวจสอบสถานะคืนรถได้");
    const result = await response.json() as { requests: EarlyReturnRequest[]; serverTime: string };
    setPending(result.requests[0] ?? null);
    return result;
  }, [booking.id]);
  useEffect(() => {
    const load = () => void read().catch(() => {});
    const start = window.setTimeout(load, 0);
    const timer = window.setInterval(load, 30_000);
    return () => { window.clearTimeout(start); window.clearInterval(timer); };
  }, [read]);
  useEffect(() => { if (preview) cancel.current?.focus(); }, [preview]);
  const close = () => { if (!lock.current) { setPreview(null); button.current?.focus(); } };
  const open = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try { const data = await read(); if (!data.requests.length) setPreview(data.serverTime); }
    catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  const submit = async () => {
    if (lock.current) return;
    lock.current = true; setBusy(true); setError("");
    try {
      const response = await fetch("/api/early-returns", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ bookingId: booking.id }) });
      const result = await response.json() as { request: EarlyReturnRequest; message?: string };
      if (!response.ok) throw new Error(result.message);
      setPending(result.request); setPreview(null); onChange();
    } catch (e) { setError((e as Error).message); }
    finally { lock.current = false; setBusy(false); }
  };
  if (!canRequestEarlyReturn(booking, now) && !pending) return null;
  return <>
    {pending ? <div className="earlyReturnPending" role="status">🟠 รอหัวหน้ายืนยันคืนรถ<small>แจ้งคืนเมื่อ {time(pending.requested_at)} น.</small></div> : <button ref={button} className="earlyReturnButton" onClick={open} disabled={busy}><Car size={18} aria-hidden="true" /> แจ้งคืนรถก่อนกำหนด</button>}
    {error && !preview && <p role="alert" className="formError">{error}</p>}
    {preview && <div className="overlay"><section className="dialog" role="dialog" aria-modal="true" aria-labelledby="early-return-title" onKeyDown={e => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const buttons = e.currentTarget.querySelectorAll<HTMLButtonElement>("button:not(:disabled)");
        const first = buttons[0]; const last = buttons[buttons.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }
    }}>
      <h2 id="early-return-title">แจ้งคืนรถก่อนกำหนด?</h2>
      <p>ผู้ใช้งาน: {booking.name}</p><p>เวลาที่ได้รับอนุมัติ:<br />{time(booking.startAt)} – {time(booking.endAt)} น.</p>
      <p>เวลาที่แจ้งคืน: {time(preview)} น.</p><p>เมื่อหัวหน้ายืนยันแล้ว รถจะพร้อมให้ผู้อื่นจองต่อจากเวลาที่แจ้งคืน<br /><small>ระบบจะบันทึกเวลาจริงเมื่อกดยืนยันแจ้งคืน</small></p>
      {error && <p role="alert" className="formError">{error}</p>}
      <div className="approvalActions"><button ref={cancel} className="cancel" onClick={close} disabled={busy}>ยกเลิก</button><button className="primary" onClick={submit} disabled={busy}>{busy ? "กำลังแจ้งคืน…" : "ยืนยันแจ้งคืน"}</button></div>
    </section></div>}
  </>;
}
