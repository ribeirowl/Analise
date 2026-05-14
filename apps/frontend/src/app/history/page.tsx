"use client";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import { formatPct, formatOdd, confidenceBadge, edgeColor } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus, BarChart2 } from "lucide-react";
import { cn } from "@/lib/utils";

async function fetchStats() {
  const { data } = await supabase.from("picks_stats").select("*");
  return data ?? [];
}

async function fetchHistory() {
  const { data } = await supabase
    .from("value_picks")
    .select("*")
    .order("match_date", { ascending: false })
    .limit(100);
  return data ?? [];
}

export default function HistoryPage() {
  const { data: stats } = useQuery({ queryKey: ["picks-stats"], queryFn: fetchStats, staleTime: 60000 });
  const { data: history, isLoading } = useQuery({ queryKey: ["picks-history"], queryFn: fetchHistory, staleTime: 60000 });

  const totalProfit = history?.reduce((s, p) => s + (p.profit_loss ?? 0), 0) ?? 0;
  const resolved = history?.filter((p) => p.result !== null) ?? [];
  const wins = resolved.filter((p) => p.result === "win").length;
  const winRate = resolved.length > 0 ? wins / resolved.length : null;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <BarChart2 className="h-6 w-6 text-accent" /> Histórico de Picks
        </h1>
        <p className="text-muted text-sm mt-1">Performance dos picks com valor — dados do Supabase</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <StatCard label="Total picks" value={String(history?.length ?? 0)} />
        <StatCard label="Resolvidos" value={String(resolved.length)} />
        <StatCard label="Win rate" value={winRate !== null ? formatPct(winRate) : "—"} color={winRate && winRate > 0.5 ? "text-accent" : "text-danger"} />
        <StatCard
          label="Profit/Loss (u)"
          value={(totalProfit >= 0 ? "+" : "") + totalProfit.toFixed(2)}
          color={totalProfit >= 0 ? "text-accent" : "text-danger"}
        />
      </div>

      {/* Stats by market */}
      {stats && stats.length > 0 && (
        <section className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Por Mercado</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b text-xs">
                  <th className="pb-2 pr-4">Mercado</th>
                  <th className="pb-2 px-3 text-center">Confiança</th>
                  <th className="pb-2 px-3 text-center">Total</th>
                  <th className="pb-2 px-3 text-center">Wins</th>
                  <th className="pb-2 px-3 text-center">Win%</th>
                  <th className="pb-2 px-3 text-center">Edge médio</th>
                  <th className="pb-2 px-3 text-center">Odd média</th>
                  <th className="pb-2 px-3 text-center">P/L</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/50">
                {stats.map((s: Record<string, unknown>, i: number) => (
                  <tr key={i} className="hover:bg-surface-2/50">
                    <td className="py-2 pr-4 font-medium">{String(s.market)}</td>
                    <td className="py-2 px-3 text-center">
                      <span className={`badge ${confidenceBadge(s.confidence as "low"|"medium"|"high")}`}>{String(s.confidence)}</span>
                    </td>
                    <td className="py-2 px-3 text-center">{String(s.total)}</td>
                    <td className="py-2 px-3 text-center text-accent">{String(s.wins)}</td>
                    <td className="py-2 px-3 text-center">{s.win_rate_pct ? `${s.win_rate_pct}%` : "—"}</td>
                    <td className="py-2 px-3 text-center">{s.avg_edge_pct ? `${s.avg_edge_pct}%` : "—"}</td>
                    <td className="py-2 px-3 text-center">{String(s.avg_odd ?? "—")}</td>
                    <td className={cn("py-2 px-3 text-center font-medium", Number(s.total_profit_loss) >= 0 ? "text-accent" : "text-danger")}>
                      {s.total_profit_loss ? (Number(s.total_profit_loss) >= 0 ? "+" : "") + s.total_profit_loss : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Pick history */}
      <section>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Histórico Completo</h2>
        {isLoading ? (
          <div className="text-muted text-sm">Carregando...</div>
        ) : (
          <div className="space-y-2">
            {history?.map((pick: Record<string, unknown>) => (
              <div key={String(pick.id)} className="card flex items-center gap-4 py-3">
                <ResultIcon result={pick.result as string | null} />
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{String(pick.home_team)} vs {String(pick.away_team)}</div>
                  <div className="text-xs text-muted">{String(pick.competition)} · {new Date(String(pick.match_date)).toLocaleDateString("pt-BR")}</div>
                </div>
                <div className="text-xs text-muted hidden sm:block">{String(pick.description)}</div>
                <div className="text-sm font-medium shrink-0">{formatOdd(Number(pick.odd))}</div>
                <div className={cn("text-xs shrink-0", edgeColor(Number(pick.edge)))}>+{formatPct(Number(pick.edge))}</div>
                <span className={`badge shrink-0 ${confidenceBadge(pick.confidence as "low"|"medium"|"high")}`}>{String(pick.confidence)}</span>
                {pick.result != null && (
                  <div className={cn("text-sm font-bold shrink-0", String(pick.result) === "win" ? "text-accent" : "text-danger")}>
                    {String(pick.result) === "win" ? `+${(Number(pick.odd) - 1).toFixed(2)}u` : "-1u"}
                  </div>
                )}
              </div>
            ))}
            {!history?.length && <div className="card text-center py-8 text-muted">Nenhum pick salvo ainda. Os picks de hoje serão salvos automaticamente.</div>}
          </div>
        )}
      </section>
    </div>
  );
}

function StatCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="card text-center">
      <div className={cn("text-2xl font-bold", color ?? "text-slate-100")}>{value}</div>
      <div className="text-xs text-muted mt-1">{label}</div>
    </div>
  );
}

function ResultIcon({ result }: { result: string | null }) {
  if (result === "win") return <TrendingUp className="h-5 w-5 text-accent shrink-0" />;
  if (result === "loss") return <TrendingDown className="h-5 w-5 text-danger shrink-0" />;
  return <Minus className="h-5 w-5 text-muted shrink-0" />;
}
