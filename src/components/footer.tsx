export default function Footer({ className = "" }: { className?: string }) {
  const currentYear = new Date().getFullYear();

  return (
    <footer
      className={`w-full py-6 text-center text-xs text-slate-500 border-t border-slate-200/80 bg-transparent ${className}`}
    >
      <p className="font-medium text-slate-600">
        © {currentYear} <b>AXIS Soluciones Digitales S.A.</b> Todos os direitos reservados.
      </p>
    </footer>
  );
}

