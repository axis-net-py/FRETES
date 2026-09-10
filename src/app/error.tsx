"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="min-h-[100dvh] grid place-content-center p-6">
      <h1 className="text-2xl font-semibold">
        Não foi possível carregar a operação
      </h1>
      <p className="my-4 text-slate-500">
        Verifique sua conexão e tente novamente.
      </p>
      <button className="btn primary" onClick={reset}>
        Tentar novamente
      </button>
    </main>
  );
}
