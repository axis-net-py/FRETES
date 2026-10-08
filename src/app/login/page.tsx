"use client";
import { FormEvent, useState } from "react";
import Link from "next/link";
import {
  Truck,
  ArrowRight,
  MapPin,
  WhatsappLogo,
  LockKey,
} from "@phosphor-icons/react";
import Footer from "@/components/footer";

export default function Login() {
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(e.currentTarget);
    try {
      const r = await fetch("/api/auth", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: form.get("password") }),
      });
      const p = await r.json();
      if (!r.ok) throw new Error(p.error);
      location.href = "/";
    } catch (e) {
      setError(e instanceof Error ? e.message : "Não foi possível entrar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-page">
      <section className="login-story">
        <Link href="/demo" className="brand flex items-center gap-2.5">
          <span className="brand-mark">
            <Truck size={23} weight="bold" />
          </span>
          <div className="flex flex-col leading-tight">
            <div className="flex items-center gap-1 font-black text-white tracking-tight text-lg">
              <span>MANU</span>
              <span className="text-[11px] text-amber-400 font-bold italic tracking-normal">
                LOGÍSTICAS
              </span>
            </div>
            <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold">
              RASTREAMENTO · AXIS
            </span>
          </div>
        </Link>

        <div>
          <div className="eyebrow text-amber-400">DO PORTO AO DESTINO</div>
          <h1>
            Cada movimento.
            <br />
            Uma informação
            <br />
            no lugar certo.
          </h1>
          <p>
            Controle de frota, caminhões e avisos em tempo real em uma única operação logística integrada.
          </p>
          <div className="flex items-center gap-5 mt-10 text-amber-400">
            <Truck size={28} weight="fill" />
            <span className="h-px w-12 bg-white/20" />
            <MapPin size={28} weight="fill" />
            <span className="h-px w-12 bg-white/20" />
            <WhatsappLogo size={28} weight="fill" />
          </div>
        </div>

        <small className="text-slate-400">
          MANU LOGÍSTICAS E.A.S · Tecnologia AXIS Soluciones Digitales S.A.
        </small>
      </section>

      <section className="login-form flex flex-col justify-between">
        <div className="max-w-sm w-full my-auto">
          <span className="container-icon mb-6 bg-slate-900 text-amber-400 border-amber-400/30">
            <LockKey size={25} weight="bold" />
          </span>
          <h2 className="text-3xl font-semibold tracking-tight text-slate-900">
            Sua operação começa aqui.
          </h2>
          <p className="text-slate-500 mt-3 mb-8">
            Entre com a senha administrativa para acessar seus fretes e controle da frota.
          </p>
          <form onSubmit={submit}>
            <label>
              Senha de acesso
              <input
                name="password"
                type="password"
                autoComplete="current-password"
                required
                autoFocus
                placeholder="Digite sua senha"
              />
            </label>
            {error && (
              <p role="alert" className="feedback">
                {error}
              </p>
            )}
            <button
              className="btn primary w-full justify-center mt-5"
              disabled={busy}
            >
              {busy ? "Entrando…" : "Entrar no painel"}
              <ArrowRight size={18} />
            </button>
          </form>

          <div className="border-t border-slate-200 mt-8 pt-6">
            <Link
              href="/demo"
              className="text-sm text-amber-800 hover:text-amber-900 font-semibold flex justify-between items-center"
            >
              <span>Conhecer o painel de demonstração</span>
              <ArrowRight size={16} />
            </Link>
          </div>
          <p className="mt-8 text-xs text-slate-400">
            Motorista? Acesse o link privado fornecido pela sua transportadora.
          </p>
        </div>

        <Footer className="mt-6 pt-4 border-t border-slate-200 w-full" />
      </section>
    </main>
  );
}
