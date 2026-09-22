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
        <Link href="/demo" className="brand">
          <span className="brand-mark">
            <Truck size={25} />
          </span>
          AXIS / fretes
        </Link>
        <div>
          <div className="eyebrow text-emerald-200">DO PORTO AO DESTINO</div>
          <h1>
            Cada movimento.
            <br />
            Uma informação
            <br />
            no lugar certo.
          </h1>
          <p>
            Seu controle de containers, motoristas e avisos em uma única
            operação.
          </p>
          <div className="flex items-center gap-5 mt-10">
            <Truck size={28} />
            <span className="h-px w-12 bg-white/25" />
            <MapPin size={28} />
            <span className="h-px w-12 bg-white/25" />
            <WhatsappLogo size={28} />
          </div>
        </div>
        <small>MANU LOGISTICA · Tecnologia AXIS</small>
      </section>
      <section className="login-form">
        <div className="max-w-sm w-full">
          <span className="container-icon mb-6">
            <LockKey size={25} />
          </span>
          <h2 className="text-3xl font-semibold tracking-tight">
            Sua operação começa aqui.
          </h2>
          <p className="text-slate-500 mt-3 mb-8">
            Entre com a senha administrativa para acessar seus fretes.
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
              className="text-sm text-emerald-800 flex justify-between"
            >
              Conhecer o painel de demonstração <ArrowUpRightLocal />
            </Link>
          </div>
          <p className="mt-8 text-xs text-slate-400">
            Motorista? Acesse o link privado fornecido pela sua transportadora.
          </p>
        </div>
      </section>
    </main>
  );
}
function ArrowUpRightLocal() {
  return <ArrowRight size={17} />;
}
