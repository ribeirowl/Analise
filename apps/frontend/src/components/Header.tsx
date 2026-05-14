import Link from "next/link";
import { TrendingUp, BarChart2 } from "lucide-react";

export default function Header() {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-700/50 bg-background/80 backdrop-blur">
      <div className="container mx-auto max-w-7xl px-4">
        <div className="flex h-14 items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-accent">
            <TrendingUp className="h-5 w-5" />
            Análise Futebol
          </Link>
          <nav className="flex items-center gap-6 text-sm text-muted">
            <Link href="/" className="hover:text-slate-100 transition-colors">Jogos</Link>
            <Link href="/value" className="hover:text-slate-100 transition-colors">
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-accent animate-pulse" />
                Picks com Valor
              </span>
            </Link>
            <Link href="/history" className="hover:text-slate-100 transition-colors flex items-center gap-1">
              <BarChart2 className="h-4 w-4" />
              Histórico
            </Link>
          </nav>
        </div>
      </div>
    </header>
  );
}
