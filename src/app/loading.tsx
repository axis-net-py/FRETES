export default function Loading() {
  return (
    <main className="p-10 max-w-7xl mx-auto">
      <div className="h-10 w-52 bg-slate-200 rounded animate-pulse mb-8" />
      <div className="h-48 bg-slate-100 rounded-2xl animate-pulse" />
      <p className="mt-5 text-slate-500">Carregando sua operação…</p>
    </main>
  );
}
