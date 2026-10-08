"use client";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import {
  SquaresFour,
  Truck,
  MapPin,
  Users,
  WhatsappLogo,
  GearSix,
  ArrowUpRight,
  SignOut,
  Package,
  List,
} from "@phosphor-icons/react";
import { useState } from "react";
import Footer from "./footer";

export default function Shell({
  children,
  demo = false,
}: {
  children: React.ReactNode;
  demo?: boolean;
}) {
  const path = usePathname();
  const query = useSearchParams();
  const currentHref =
    (demo ? "/" : path) + (query.toString() ? "?" + query.toString() : "");
  const [open, setOpen] = useState(false);
  const nav = [
    { href: "/", name: "Visão geral & Frota", icon: SquaresFour },
    { href: "/?view=fretes", name: "Fretes", icon: Package },
    { href: "/importar", name: "Importar documento", icon: Package },
    { href: "/cadastro?tab=drivers", name: "Motoristas", icon: Truck },
    { href: "/cadastro?tab=clients", name: "Clientes", icon: Users },
    { href: "/cadastro?tab=gates", name: "Portos e portões", icon: MapPin },
    { href: "/?view=mensagens", name: "Mensagens", icon: WhatsappLogo },
  ];

  return (
    <div className="app-shell">
      {/* Mobile Drawer Backdrop */}
      {open && (
        <div
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${open ? "mobile-open" : ""}`}>
        <Link href={demo ? "/demo" : "/"} className="brand" onClick={() => setOpen(false)}>
          <span className="brand-mark">
            <Truck size={22} weight="bold" />
          </span>
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1 font-black text-slate-900 tracking-tight text-lg">
              <span>MANU</span>
              <span className="text-[11px] text-amber-600 font-bold italic tracking-normal">LOGÍSTICAS</span>
            </div>
            <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
              RASTREAMENTO
            </span>
          </div>
        </Link>

        <div className="workspace">
          <span className="workspace-avatar">ML</span>
          <div className="min-w-0 flex-1">
            <b className="truncate block">MANU LOGÍSTICAS E.A.S</b>
            <small className="truncate block text-slate-500">Operação Logística</small>
          </div>
          <span className="ml-auto text-amber-600 text-[10px] font-bold px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200">
            PY/BR
          </span>
        </div>

        <p className="nav-label">OPERAÇÃO</p>
        <nav>
          {nav.map((n) => (
            <Link
              key={n.name}
              href={
                demo
                  ? n.href.startsWith("/cadastro")
                    ? "/login"
                    : "/demo" + n.href.slice(1)
                  : n.href
              }
              onClick={() => setOpen(false)}
              className={
                currentHref === n.href ? "nav-item active" : "nav-item"
              }
            >
              <n.icon size={20} />
              <span>{n.name}</span>
              {n.name === "Mensagens" && (
                <span className="ml-auto status-dot" />
              )}
            </Link>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="driver-callout">
            <span className="text-amber-400">
              <Truck size={23} weight="fill" />
            </span>
            <b>Rastreamento direto no cavalo.</b>
            <p>Posições em tempo real da GlobalSAT sincronizadas nos veículos da frota.</p>
            <Link href={demo ? "/demo" : "/?view=fretes"} onClick={() => setOpen(false)}>
              Acompanhar fretes <ArrowUpRight size={16} />
            </Link>
          </div>

          <Link
            href={demo ? "/login" : "/cadastro?tab=settings"}
            className="nav-item"
            onClick={() => setOpen(false)}
          >
            <GearSix size={20} />
            Configurações
          </Link>
          <button
            className="nav-item w-full"
            onClick={async () => {
              await fetch("/api/auth", { method: "DELETE" });
              location.href = "/login";
            }}
          >
            <SignOut size={20} />
            Sair
          </button>

          <div className="profile">
            <span className="workspace-avatar small">AX</span>
            <div>
              <b>{demo ? "Modo demonstração" : "Operador AXIS"}</b>
              <small>Tecnologia AXIS Soluciones</small>
            </div>
          </div>
        </div>
      </aside>

      <div className="main-wrapper flex flex-col min-h-screen">
        <header className="topbar">
          <button
            aria-label="Abrir menu"
            className="mobile-menu"
            onClick={() => setOpen(!open)}
          >
            <List size={24} />
          </button>
          <div className="text-xs sm:text-sm text-slate-500 truncate flex items-center gap-1 sm:gap-2">
            <b className="text-slate-900 font-bold">MANU LOGÍSTICAS E.A.S</b>
            <span className="text-slate-300">/</span>
            <span className="text-amber-700 font-semibold truncate">Operação de Fretes & Telemetria</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="hidden md:inline text-xs font-medium text-slate-400">
              Desenvolvido por AXIS
            </span>
            <span className="workspace-avatar small">ML</span>
          </div>
        </header>

        {demo && (
          <div className="demo-bar">
            Demonstração com dados fictícios. Nenhuma mensagem é enviada.{" "}
            <Link href="/login">Entrar na operação →</Link>
          </div>
        )}

        <main className="page-content flex-1 w-full">{children}</main>

        <Footer className="mt-auto" />
      </div>
    </div>
  );
}
