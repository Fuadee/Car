/* eslint-disable @next/next/no-html-link-for-pages */
const rows = [
  ["CAR-20260720-A1B2", "คุณธนา", "20 ก.ค. · 11:00–12:30", "ประชุมนอกสถานที่", "กำลังใช้งาน"],
  ["CAR-20260720-C3D4", "คุณกมล", "20 ก.ค. · 14:00–16:00", "รับอุปกรณ์สำนักงาน", "ยืนยันแล้ว"],
  ["CAR-20260721-E5F6", "คุณวราภรณ์", "21 ก.ค. · 09:00–11:00", "ติดต่อราชการ", "ยืนยันแล้ว"],
];

export default function AdminBookings() {
  return <main className="adminPage"><header className="adminHeader"><div><p className="eyebrow">พื้นที่ผู้ดูแลระบบ</p><h1>จัดการรถส่วนกลาง</h1></div><a href="/">กลับหน้าจองรถ</a></header><section className="adminStats"><article><span>รายการวันนี้</span><strong>3</strong></article><article><span>กำลังใช้งาน</span><strong>1</strong></article><article><span>รายการถัดไป</span><strong>2</strong></article></section><section className="adminPanel"><div className="adminTools"><div><h2>รายการจองทั้งหมด</h2><p>ค้นหา ตรวจสอบ และจัดการรายการจองรถ</p></div><button className="primary">＋ สร้างรายการแทนผู้ใช้</button></div><div className="filters"><input placeholder="ค้นหาชื่อ เลขอ้างอิง ภารกิจ หรือเบอร์โทร"/><input type="date"/><select aria-label="กรองสถานะ"><option>ทุกสถานะ</option><option>ยืนยันแล้ว</option><option>ยกเลิกแล้ว</option></select></div><div className="adminList">{rows.map((r) => <article key={r[0]}><div><small>{r[0]}</small><strong>{r[1]}</strong><span>{r[3]}</span></div><div><strong>{r[2]}</strong><span className="adminStatus">{r[4]}</span></div><button>ดูรายละเอียด</button></article>)}</div></section><aside className="adminAside"><h2>ข้อมูลรถ</h2><p><b>รถยนต์ส่วนกลาง</b><br/>ทะเบียน: ระบุภายหลัง</p><button className="outline">แก้ไขข้อมูลรถ</button><hr/><h2>QR Code หน้าจองรถ</h2><div className="qrPlaceholder">QR</div><p>สแกนเพื่อตรวจสอบและจองรถส่วนกลาง</p><button className="outline">ดาวน์โหลดสำหรับพิมพ์</button></aside></main>;
}
