import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

const lineSeedSansTH = localFont({
  src: [
    {
      path: "./fonts/LINESeedSansTH_W_Rg.woff2",
      weight: "400",
      style: "normal",
    },
    {
      path: "./fonts/LINESeedSansTH_W_Bd.woff2",
      weight: "700",
      style: "normal",
    },
  ],
  display: "swap",
});

export const metadata: Metadata = {
  title: "ระบบจองรถส่วนกลาง",
  description: "ตรวจสอบตารางและจองรถส่วนกลางได้ง่ายในไม่กี่ขั้นตอน",
  openGraph: {
    title: "ระบบจองรถส่วนกลาง",
    description: "ตรวจสอบตารางและจองรถได้ง่าย",
    images: [{ url: "/og.png", width: 1733, height: 877 }],
    locale: "th_TH",
    type: "website",
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="th"><body className={lineSeedSansTH.className}>{children}</body></html>;
}
