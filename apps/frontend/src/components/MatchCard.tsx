import Link from "next/link";
import Image from "next/image";
import type { EnrichedMatch } from "@analise-futebol/shared";
import { formatTime, formatOdd, cn } from "@/lib/utils";
import { TrendingUp, Clock } from "lucide-react";

interface Props {
  match: EnrichedMatch;
}

export default function MatchCard({ match }: Props) {
  const bestHome = Math.max(...match.odds?.bookmakers.map((b) => b.home ?? 0) ?? [0]) || null;
  const bestDraw = Math.max(...match.odds?.bookmakers.map((b) => b.draw ?? 0) ?? [0]) || null;
  const bestAway = Math.max(...match.odds?.bookmakers.map((b) => b.away ?? 0) ?? [0]) || null;
  const hasValue = match.valuePicks.length > 0;
  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const isFinished = match.status === "FINISHED";

  return (
    <Link href={`/matches/${match.id}`} className="block">
      <div className={cn("card hover:border-slate-600 transition-all cursor-pointer", hasValue && "border-accent/40 hover:border-accent/60")}>
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs text-muted truncate">{match.competition.name}</span>
          <div className="flex items-center gap-2 shrink-0">
            {hasValue && (
              <span className="badge bg-accent/20 text-accent text-[10px]">
                <TrendingUp className="h-3 w-3 mr-1" />
                {match.valuePicks.length} pick{match.valuePicks.length > 1 ? "s" : ""}
              </span>
            )}
            {isLive && <span className="badge bg-red-900 text-red-300 text-[10px] animate-pulse">AO VIVO</span>}
          </div>
        </div>

        {/* Teams + Score */}
        <div className="flex items-center gap-3">
          {/* Home */}
          <div className="flex flex-1 items-center gap-2 min-w-0">
            {match.homeTeam.crest && (
              <Image src={match.homeTeam.crest} alt={match.homeTeam.name} width={28} height={28} className="shrink-0" />
            )}
            <span className="font-medium truncate">{match.homeTeam.shortName ?? match.homeTeam.name}</span>
          </div>

          {/* Score / Time */}
          <div className="shrink-0 text-center min-w-[60px]">
            {isFinished || isLive ? (
              <span className={cn("text-lg font-bold", isLive && "text-red-400")}>
                {match.score.fullTime.home ?? 0} – {match.score.fullTime.away ?? 0}
              </span>
            ) : (
              <span className="flex items-center gap-1 text-sm text-muted">
                <Clock className="h-3 w-3" />
                {formatTime(match.utcDate)}
              </span>
            )}
          </div>

          {/* Away */}
          <div className="flex flex-1 items-center justify-end gap-2 min-w-0">
            <span className="font-medium truncate text-right">{match.awayTeam.shortName ?? match.awayTeam.name}</span>
            {match.awayTeam.crest && (
              <Image src={match.awayTeam.crest} alt={match.awayTeam.name} width={28} height={28} className="shrink-0" />
            )}
          </div>
        </div>

        {/* Odds row */}
        {(bestHome || bestDraw || bestAway) && (
          <div className="flex gap-2 mt-3">
            <OddPill label="1" value={bestHome} />
            <OddPill label="X" value={bestDraw} />
            <OddPill label="2" value={bestAway} />
          </div>
        )}
      </div>
    </Link>
  );
}

function OddPill({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex-1 flex items-center justify-between rounded-lg bg-surface-2 px-2 py-1 text-xs">
      <span className="text-muted">{label}</span>
      <span className="font-medium">{formatOdd(value)}</span>
    </div>
  );
}
