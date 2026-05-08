import type { ValuePick } from "@analise-futebol/shared";
import { formatOdd, formatPct, edgeColor, confidenceBadge } from "@/lib/utils";
import { TrendingUp } from "lucide-react";
import Link from "next/link";

export default function ValueAlert({ pick, showMatch = false }: { pick: ValuePick; showMatch?: boolean }) {
  return (
    <div className="card border-l-2 border-l-accent space-y-2">
      {showMatch && (
        <Link href={`/matches/${pick.matchId}`} className="text-xs text-muted hover:text-slate-100 transition-colors">
          {pick.homeTeam} vs {pick.awayTeam} · {pick.competition}
        </Link>
      )}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <TrendingUp className="h-4 w-4 text-accent shrink-0" />
            <span className="font-medium text-sm">{pick.description}</span>
            <span className={`badge ${confidenceBadge(pick.confidence)}`}>{pick.confidence}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-muted">
            <span>{pick.bookmaker}</span>
            <span>Odd: <strong className="text-slate-200">{formatOdd(pick.odd)}</strong></span>
            <span>Implícita: {formatPct(pick.impliedProbability)}</span>
            <span>Estimada: {formatPct(pick.estimatedProbability)}</span>
          </div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-lg font-bold ${edgeColor(pick.edge)}`}>
            +{formatPct(pick.edge)}
          </div>
          <div className="text-[10px] text-muted">edge</div>
        </div>
      </div>
    </div>
  );
}
