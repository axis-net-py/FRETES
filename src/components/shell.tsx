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
    { href: "/", name: "Visão geral", icon: SquaresFour },
    { href: "/?view=fretes", name: "Fretes", icon: Package },
    { href: "/importar", name: "Importar documento", icon: Package },
    { href: "/cadastro?tab=drivers", name: "Motoristas", icon: Truck },
    { href: "/cadastro?tab=clients", name: "Clientes", icon: Users },
    { href: "/cadastro?tab=gates", name: "Portos e portões", icon: MapPin },
    { href: "/?view=mensagens", name: "Mensagens", icon: WhatsappLogo },
  ];
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "mobile-open" : ""}`}>
        <Link href={demo ? "/demo" : "/"} className="brand">
          <span className="brand-mark">
            <Truck size={23} weight="bold" />
          </span>
          <span>
            AXIS<span className="font-normal opacity-60"> / </span>
            <span className="font-normal">fretes</span>
          </span>
        </Link>
        <div className="workspace">
          <span className="workspace-avatar">ML</span>
          <div>
            <b>MANU LOGISTICA</b>
            <small>Operação logística</small>
          </div>
          <span className="ml-auto text-gray-400">⌄</span>
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
              {n.name}
              {n.name === "Mensagens" && (
                <span className="ml-auto status-dot" />
              )}
            </Link>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="driver-callout">
            <span className="text-emerald-300">
              <Truck size={23} />
            </span>
            <b>Rastreamento direto no cavalo.</b>
            <p>Posições recebidas do rastreador GlobalSAT instalado no veículo.</p>
            <Link href={demo ? "/demo" : "/?view=fretes"}>
              Acompanhar fretes <ArrowUpRight size={16} />
            </Link>
          </div>
          <Link
            href={demo ? "/login" : "/cadastro?tab=settings"}
            className="nav-item"
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
            <span className="workspace-avatar">OP</span>
            <div>
              <b>{demo ? "Modo demonstração" : "Administrador"}</b>
              <small>Controle da operação</small>
            </div>
          </div>
        </div>
      </aside>
      <div className="main-wrapper">
        <header className="topbar">
          <button
            aria-label="Abrir menu"
            className="mobile-menu"
            onClick={() => setOpen(!open)}
          >
            <List size={24} />
          </button>
          <div className="text-sm text-slate-500">
            MANU LOGISTICA <span className="mx-3 text-slate-300">/</span>{" "}
            <span className="text-slate-800">Operação de fretes</span>
          </div>
          <div className="flex items-center gap-4">
            <span className="hidden sm:inline text-xs text-slate-500">
              Do porto ao destino.
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
        <main className="page-content">{children}</main>
      </div>
    </div>
  );
}
