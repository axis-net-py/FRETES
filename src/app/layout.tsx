import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Container Track",
  description: "Controle de frete de container com alerta automático no WhatsApp",
  manifest: "/manifest.webmanifest",
  appleWebApp: { capable: true, title: "Container Track", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

const NAV = [
  { href: "/", label: "Painel" },
  { href: "/cadastro", label: "Cadastro" },
  { href: "/motorista", label: "Motorista" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        <header className="border-b border-slate-800 bg-slate-900">
          <nav className="mx-auto flex max-w-5xl items-center gap-4 px-4 py-3">
            <span className="font-semibold">Container Track</span>
            <div className="flex gap-3 text-sm text-slate-300">
              {NAV.map((item) => (
                <Link key={item.href} href={item.href} className="hover:text-white">
                  {item.label}
                </Link>
              ))}
            </div>
          </nav>
        </header>
        <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
      </body>
    </html>
  );
}
