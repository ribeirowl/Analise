import { fetchMatch } from "@/lib/api";
import OddsTable from "@/components/OddsTable";
import PlayerStatsTable from "@/components/PlayerStatsTable";
import ValueAlert from "@/components/ValueAlert";
import StatsChart from "@/components/StatsChart";
import Image from "next/image";
import { formatDate, cn } from "@/lib/utils";
import { MapPin, User, Clock, TrendingUp } from "lucide-react";
import type { Metadata } from "next";
import type { EnrichedMatch } from "@analise-futebol/shared";

export const revalidate = 300;

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  try {
    const m = await fetchMatch(params.id);
    return { title: `${m.homeTeam.name} vs ${m.awayTeam.name} | Análise Futebol` };
  } catch {
    return { title: "Jogo | Análise Futebol" };
  }
}

export default async function MatchPage({ params }: { params: { id: string } }) {
  let match: EnrichedMatch | null = null;
  let error: string | null = null;

  try {
    match = await fetchMatch(params.id);
  } catch (err) {
    error = String(err);
  }

  if (error || !match) {
    return (
      <div className="card text-center py-12">
        <p className="text-danger">Jogo não encontrado</p>
        <p className="text-sm text-muted mt-2">{error}</p>
      </div>
    );
  }

  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const isFinished = match.status === "FINISHED";

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="card text-center space-y-4">
        <p className="text-xs text-muted uppercase tracking-wider">{match.competition.name}</p>

        <div className="flex items-center justify-center gap-8">
          {/* Home */}
          <div className="flex flex-col items-center gap-2 flex-1">
            {match.homeTeam.crest && (
              <Image src={match.homeTeam.crest} alt={match.homeTeam.name} width={56} height={56} />
            )}
            <span className="font-bold text-lg">{match.homeTeam.name}</span>
          </div>

          {/* Score / Time */}
          <div className="text-center">
            {isFinished || isLive ? (
              <div>
                <div className={cn("text-4xl font-black", isLive && "text-red-400")}>
                  {match.score.fullTime.home} – {match.score.fullTime.away}
                </div>
                {isLive && <div className="text-xs text-red-400 mt-1 animate-pulse">AO VIVO</div>}
                {isFinished && match.score.halfTime.home !== null && (
                  <div className="text-xs text-muted mt-1">
                    Intervalo: {match.score.halfTime.home}–{match.score.halfTime.away}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-3xl font-black text-muted">vs</div>
                <div className="flex items-center gap-1 text-sm text-muted justify-center">
                  <Clock className="h-3 w-3" />
                  {formatDate(match.utcDate)}
                </div>
              </div>
            )}
          </div>

          {/* Away */}
          <div className="flex flex-col items-center gap-2 flex-1">
            {match.awayTeam.crest && (
              <Image src={match.awayTeam.crest} alt={match.awayTeam.name} width={56} height={56} />
            )}
            <span className="font-bold text-lg">{match.awayTeam.name}</span>
          </div>
        </div>

        {/* Meta */}
        <div className="flex items-center justify-center gap-4 text-xs text-muted flex-wrap">
          {match.venue && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" />{match.venue}</span>}
          {match.referee && <span className="flex items-center gap-1"><User className="h-3 w-3" />Árbitro: {match.referee}</span>}
        </div>
      </div>

      {/* Value picks */}
      {match.valuePicks.length > 0 && (
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-accent mb-3 flex items-center gap-2">
            <TrendingUp className="h-4 w-4" /> Picks com Valor
          </h2>
          <div className="space-y-3">
            {match.valuePicks.map((pick, i) => <ValueAlert key={i} pick={pick} />)}
          </div>
        </section>
      )}

      {/* Odds */}
      {match.odds && (
        <section className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Odds por Casa</h2>
          <OddsTable odds={match.odds} />
        </section>
      )}

      {/* Stats chart */}
      {match.homeSeasonStats && match.awaySeasonStats && (
        <section className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Comparação Estatística</h2>
          <StatsChart home={match.homeSeasonStats} away={match.awaySeasonStats} />
        </section>
      )}

      {/* Player stats */}
      {(match.homeTopPlayers.length > 0 || match.awayTopPlayers.length > 0) && (
        <section className="card space-y-6">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted">Top Jogadores na Temporada</h2>
          <PlayerStatsTable players={match.homeTopPlayers} title={match.homeTeam.name} />
          <PlayerStatsTable players={match.awayTopPlayers} title={match.awayTeam.name} />
        </section>
      )}

      {/* Lineups */}
      {(match.homeLineup || match.awayLineup) && (
        <section className="card">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Escalações Prováveis</h2>
          <div className="grid md:grid-cols-2 gap-6">
            {match.homeLineup && (
              <div>
                <h3 className="text-sm font-medium mb-2">{match.homeTeam.name} <span className="text-muted">{match.homeLineup.formation}</span></h3>
                <ul className="space-y-1">
                  {match.homeLineup.players.map((p) => (
                    <li key={p.playerId} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-center text-muted text-xs">{p.jerseyNumber}</span>
                      <span>{p.name}</span>
                      {p.captain && <span className="badge bg-yellow-900 text-yellow-300 text-[10px]">C</span>}
                      {p.position && <span className="text-[10px] text-muted ml-auto">{p.position}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {match.awayLineup && (
              <div>
                <h3 className="text-sm font-medium mb-2">{match.awayTeam.name} <span className="text-muted">{match.awayLineup.formation}</span></h3>
                <ul className="space-y-1">
                  {match.awayLineup.players.map((p) => (
                    <li key={p.playerId} className="flex items-center gap-2 text-sm">
                      <span className="w-5 text-center text-muted text-xs">{p.jerseyNumber}</span>
                      <span>{p.name}</span>
                      {p.captain && <span className="badge bg-yellow-900 text-yellow-300 text-[10px]">C</span>}
                      {p.position && <span className="text-[10px] text-muted ml-auto">{p.position}</span>}
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
}
