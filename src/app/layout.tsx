import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
const geist = localFont({
  src: "./fonts/GeistVF.woff",
  variable: "--font-geist",
});
export const metadata: Metadata = {
  title: "AXIS Fretes · Controle de containers",
  description:
    "Do porto ao destino. Controle de fretes, acompanhamento GPS e avisos por WhatsApp.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg" },
  appleWebApp: { capable: true, title: "AXIS Fretes" },
};
export const viewport: Viewport = {
  themeColor: "#183f37",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR">
      <body className={geist.variable}>{children}</body>
    </html>
  );
}
