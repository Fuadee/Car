"use client";

import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import type { EarlyReturnRequest } from "@/lib/early-returns/types";
import type { VehicleUsageRequest } from "@/lib/vehicle-usage-requests/types";

const dateTime = (iso: string) => new Intl.DateTimeFormat("th-TH", {
  day: "numeric", month: "short", year: "numeric", hour: "2-digit",
  minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Bangkok",
}).format(new Date(iso));

type Action = "approve" | "reject" | "cancel" | "returnConfirm" | "returnReject";
type ActionTarget = { request: VehicleUsageRequest | null; action: Action; returnRequest?: EarlyReturnRequest };

function statusDetails(request: VehicleUsageRequest) {
  if (request.status === "approved") return { className: "approvedBadge", label: "อนุมัติแล้ว", at: request.approvedAt, atLabel: "อนุมัติเมื่อ" };
  if (request.status === "rejected") return { className: "rejectedBadge", label: "ไม่อนุมัติ", at: request.rejectedAt, atLabel: "ไม่อนุมัติเมื่อ" };
  if (request.status === "cancelled") return { className: "cancelledBadge", label: "ยกเลิกแล้ว", at: request.cancelledAt, atLabel: "ยกเลิกเมื่อ" };
  return { className: "pendingBadge", label: "รออนุมัติ", at: null, atLabel: "ส่งคำขอ" };
}

function RequestCard({ request, onAction }: { request: VehicleUsageRequest; onAction?: (request: VehicleUsageRequest, action: Action) => void }) {
  const status = statusDetails(request);
  return <article className="usageRequest">
    <div className="usageRequestTop"><div><strong>{request.purpose}</strong><span>{request.name} · {request.vehicleName}</span></div><span className={status.className}>{status.label}</span></div>
    <dl><div><dt>สถานที่</dt><dd>{request.destination}</dd></div><div><dt>เริ่มใช้</dt><dd>{dateTime(request.startAt)} น.</dd></div><div><dt>สิ้นสุด</dt><dd>{dateTime(request.endAt)} น.</dd></div><div><dt>{status.atLabel}</dt><dd>{dateTime(status.at ?? request.createdAt)} น.</dd></div></dl>
    {onAction && request.status === "pending" && <div className="usageActions"><button className="approveButton" onClick={() => onAction(request, "approve")}>อนุมัติ</button><button className="rejectButton" onClick={() => onAction(request, "reject")}>ไม่อนุมัติ</button><button className="cancelRequestButton" onClick={() => onAction(request, "cancel")}>ยกเลิกคำขอ</button></div>}
    {onAction && request.status === "approved" && <div className="usageActions"><button className="cancelRequestButton" onClick={() => onAction(request, "cancel")}>ยกเลิกการใช้รถ</button></div>}
  </article>;
}

export default function VehicleUsagePage() {
  const [returns, setReturns] = useState<EarlyReturnRequest[]>([]);
  const [returnError, setReturnError] = useState("");
  const [highlight, setHighlight] = useState<string | null>(null);
  const [pending, setPending] = useState<VehicleUsageRequest[]>([]);
  const [history, setHistory] = useState<VehicleUsageRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [target, setTarget] = useState<ActionTarget | null>(null);
  const [pin, setPin] = useState("");
  const [actionError, setActionError] = useState("");
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement | null>(null);
  const loadReturns = useCallback(async () => {
    try { const response = await fetch("/api/early-returns", { cache: "no-store" }); const data = await response.json() as { requests?: EarlyReturnRequest[]; message?: string }; if (!response.ok) throw new Error(data.message); setReturns(data.requests ?? []); setReturnError(""); }
    catch { setReturnError("ไม่สามารถโหลดรายการคืนรถได้"); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => { setHighlight(new URLSearchParams(window.location.search).get("returnRequest")); void loadReturns(); }, 0); const poll = window.setInterval(() => void loadReturns(), 30_000); return () => { window.clearTimeout(timer); window.clearInterval(poll); }; }, [loadReturns]);
  useEffect(() => { if (highlight && returns.length) document.getElementById(`return-${highlight}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }); }, [highlight, returns]);
  const loadRequests = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [pendingResponse, historyResponse] = await Promise.all([fetch("/api/vehicle-usage-requests", { cache: "no-store" }), fetch("/api/vehicle-usage-requests?status=history", { cache: "no-store" })]);
      const [pendingResult, historyResult] = await Promise.all([pendingResponse.json() as Promise<{ requests?: VehicleUsageRequest[]; message?: string }>, historyResponse.json() as Promise<{ requests?: VehicleUsageRequest[]; message?: string }>]);
      if (!pendingResponse.ok || !historyResponse.ok) throw new Error(pendingResult.message ?? historyResult.message);
      setPending(pendingResult.requests ?? []); setHistory(historyResult.requests ?? []);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "ไม่สามารถโหลดคำขอใช้รถได้"); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { const timer = window.setTimeout(() => void loadRequests(), 0); return () => window.clearTimeout(timer); }, [loadRequests]);
  useEffect(() => { if (!target) return; const frame = window.requestAnimationFrame(() => pinRef.current?.focus()); return () => window.cancelAnimationFrame(frame); }, [target]);
  const closeModal = () => { if (!busy) { setTarget(null); setPin(""); setActionError(""); } };
  const openAction = (request: VehicleUsageRequest, action: Action) => { setTarget({ request, action }); setPin(""); setActionError(""); };
  const submitAction = async (event: FormEvent) => {
    event.preventDefault(); if (!target || busy) return; setBusy(true); setActionError("");
    try {
      const response = await fetch(target.returnRequest ? `/api/early-returns/${target.returnRequest.id}/${target.action === "returnConfirm" ? "confirm" : "reject"}` : `/api/vehicle-usage-requests/${target.request!.id}/${target.action}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pin }) });
      const result = (await response.json()) as { message?: string };
      if (!response.ok) { setActionError(result.message ?? "ไม่สามารถดำเนินการได้"); return; }
      setTarget(null); setPin(""); await Promise.all([loadRequests(), loadReturns()]);
    } catch { setActionError("ไม่สามารถเชื่อมต่อฐานข้อมูลได้ กรุณาลองใหม่"); }
    finally { setBusy(false); }
  };
  const modalTitle = target?.action === "returnConfirm" ? "ยืนยันคืนรถก่อนกำหนด" : target?.action === "returnReject" ? "ไม่ยืนยันคืนรถก่อนกำหนด" : target?.action === "approve" ? "อนุมัติคำขอใช้รถ" : target?.action === "reject" ? "ไม่อนุมัติคำขอใช้รถ" : target?.request?.status === "approved" ? "ยกเลิกการใช้รถ?" : "ยกเลิกคำขอใช้รถ?";
  const submitLabel = target?.action === "cancel" ? "ยืนยันการยกเลิก" : "ยืนยัน";
  const busyLabel = target?.action === "approve" ? "กำลังอนุมัติ..." : target?.action === "cancel" ? "กำลังยกเลิก..." : "กำลังบันทึก...";
  return <main className="usagePage"><header className="topbar"><Link className="homeBrand" href="/" aria-label="กลับหน้าหลัก"><div className="brandMark" aria-hidden="true">▰</div><div className="brand"><strong>ระบบจองรถส่วนกลาง</strong><span>รายการคำขอใช้รถ</span></div></Link><Link className={`usageLink usageLinkActive ${pending.length > 0 ? "hasPending" : ""}`} href="/vehicle-usage" aria-current="page"><ClipboardList aria-hidden="true" /><span>การใช้รถ</span>{pending.length > 0 && <small><b>{pending.length}</b><em> รออนุมัติ</em></small>}</Link></header><section className="usageContent"><div className="usageHeading"><h2>รอยืนยันคืนรถก่อนกำหนด</h2></div>{returnError && <p role="alert">{returnError} <button onClick={loadReturns}>ลองใหม่</button></p>}{!returnError && !returns.some(r => r.status === "pending") && <p className="usageState">ยังไม่มีรายการรอยืนยันคืนรถ</p>}<div className="usageList">{returns.filter(r => r.status === "pending").map(r => <ReturnCard key={r.id} request={r} highlight={highlight === r.id} onAction={confirm => { setTarget({ request: null, returnRequest: r, action: confirm ? "returnConfirm" : "returnReject" }); setPin(""); setActionError(""); }} />)}</div><div className="usageHeading historyHeading"><h2>ประวัติแจ้งคืนรถก่อนกำหนด</h2></div><div className="usageList">{returns.filter(r => r.status !== "pending").map(r => <ReturnCard key={r.id} request={r} highlight={highlight === r.id} />)}</div><div className="usageHeading"><div><p className="eyebrow">การใช้รถ</p><h1>คำขอรออนุมัติ</h1></div><span className="pendingCount">{pending.length} รายการ</span></div>{loading && <p className="usageState">กำลังโหลดคำขอใช้รถ…</p>}{error && <p className="usageState usageError">{error} <button onClick={loadRequests}>ลองใหม่</button></p>}{!loading && !error && !pending.length && <p className="usageState">ยังไม่มีคำขอที่รออนุมัติ</p>}<div className="usageList">{pending.map((request) => <RequestCard key={request.id} request={request} onAction={openAction} />)}</div><div className="usageHeading historyHeading"><div><p className="eyebrow">ประวัติ</p><h2>รายการที่ดำเนินการแล้ว</h2></div></div>{!loading && !error && !history.length && <p className="usageState">ยังไม่มีประวัติการอนุมัติ</p>}<div className="usageList">{history.map((request) => <RequestCard key={request.id} request={request} onAction={openAction} />)}</div></section>{target && <div className="overlay" onMouseDown={(event) => event.target === event.currentTarget && closeModal()}><form className="dialog approvalDialog" role="dialog" aria-modal="true" aria-label="ยืนยันโดยหัวหน้า" onSubmit={submitAction}><p className="eyebrow">ยืนยันโดยหัวหน้า</p><h2>{modalTitle}</h2>{target.returnRequest && <p>{target.returnRequest.booking?.name}<br />แจ้งคืนเมื่อ {dateTime(target.returnRequest.requested_at)} น.<br />{target.action === "returnConfirm" ? "รถจะว่างตั้งแต่เวลาที่แจ้งคืน โดยเก็บเวลาที่ได้รับอนุมัติเดิมไว้" : "รถยังไม่ว่างจนถึงกำหนดเดิม"}</p>}{target.action === "cancel" && target.request && <p>{target.request.name}<br />{target.request.vehicleName}<br />{dateTime(target.request.startAt)} – {dateTime(target.request.endAt)}<br />รายการจะถูกนำออกจากปฏิทิน แต่ประวัติจะยังถูกเก็บไว้</p>}<p>กรุณากรอก PIN หัวหน้าเพื่อยืนยันการดำเนินการ</p><label>Manager PIN<input ref={pinRef} value={pin} onChange={(event) => setPin(event.target.value.replace(/\D/g, ""))} inputMode="numeric" type="password" autoComplete="off" maxLength={32} disabled={busy} /></label>{actionError && <p className="formError">! {actionError}</p>}<div className="approvalActions"><button type="button" className="cancel" onClick={closeModal} disabled={busy}>ยกเลิก</button><button className={(target.action === "approve" || target.action === "returnConfirm") ? "approveButton" : "rejectButton"} disabled={busy || !pin}>{busy ? busyLabel : submitLabel}</button></div></form></div>}</main>;
}

function ReturnCard({ request: r, highlight, onAction }: { request: EarlyReturnRequest; highlight: boolean; onAction?: (confirm: boolean) => void }) {
  return <article id={`return-${r.id}`} className={`usageRequest ${highlight ? "returnHighlighted" : ""}`}>
    <div className="usageRequestTop"><div><strong>{r.booking?.purpose}</strong><span>{r.booking?.name} · {r.vehicleName ?? "รถยนต์ส่วนกลาง"}</span></div><span className={r.status === "pending" ? "pendingBadge" : r.status === "confirmed" ? "approvedBadge" : "rejectedBadge"}>{r.status === "pending" ? "รอยืนยันคืนรถ" : r.status === "confirmed" ? "ยืนยันคืนรถแล้ว" : "ไม่ยืนยันคืนรถ"}</span></div>
    <dl>{r.booking && <><div><dt>เริ่มใช้งาน</dt><dd>{dateTime(r.booking.startAt)} น.</dd></div><div><dt>ได้รับอนุมัติถึง</dt><dd>{dateTime(r.booking.endAt)} น.</dd></div></>}<div><dt>แจ้งคืนก่อนกำหนด</dt><dd>{dateTime(r.requested_at)} น.</dd></div>{r.confirmed_at && <div><dt>หัวหน้ายืนยัน</dt><dd>{dateTime(r.confirmed_at)} น. · {r.reviewed_by}</dd></div>}{r.rejected_at && <div><dt>หัวหน้าไม่ยืนยัน</dt><dd>{dateTime(r.rejected_at)} น. · {r.reviewed_by}</dd></div>}</dl>
    {onAction && <div className="usageActions"><button className="approveButton" onClick={() => onAction(true)}>ยืนยันคืนรถ</button><button className="rejectButton" onClick={() => onAction(false)}>ไม่ยืนยัน</button></div>}
  </article>;
}
