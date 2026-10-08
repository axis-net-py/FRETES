export default function Footer({ className = "" }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={`w-full py-6 text-center text-xs text-slate-500 border-t border-slate-200/80 bg-transparent ${className}`}
    >
      <div className="max-w-7xl mx-auto px-4 flex flex-col sm:flex-row items-center justify-between gap-2">
        <p className="font-medium text-slate-600">
          © {currentYear} <b>AXIS Soluciones Digitales S.A.</b> Todos os direitos reservados.
        </p>
        <div className="flex items-center gap-3 text-[11px] text-slate-400">
          <span>Desenvolvido para <b>MANU LOGÍSTICAS E.A.S</b></span>
          <span className="hidden sm:inline">·</span>
          <span className="hidden sm:inline">Tecnologia Logística & Telemetria</span>
        </div>
      </div>
    </footer>
  );
}
