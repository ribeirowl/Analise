"use client";
import { useState } from "react";
import { useMatchDetail } from "@/hooks/useMatches";
import { useQuery } from "@tanstack/react-query";
import { fetchH2H, fetchPredictions, fetchInjuries } from "@/lib/api";
import OddsTable from "@/components/OddsTable";
import PlayerStatsTable from "@/components/PlayerStatsTable";
import ValueAlert from "@/components/ValueAlert";
import StatsChart from "@/components/StatsChart";
import Image from "next/image";
import { formatDate, formatPct, cn } from "@/lib/utils";
import { MapPin, User, Clock, TrendingUp, GitCompare, Brain, AlertTriangle } from "lucide-react";
import { MatchCardSkeleton } from "@/components/Skeleton";

type Tab = "stats" | "h2h" | "prediction" | "injuries" | "odds";

export default function MatchPage({ params }: { params: { id: string } }) {
  const { data: match, isLoading, error } = useMatchDetail(params.id);
  const [tab, setTab] = useState<Tab>("stats");

  const { data: h2h } = useQuery({
    queryKey: ["h2h", params.id],
    queryFn: () => fetchH2H(params.id),
    enabled: tab === "h2h",
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: predictions } = useQuery({
    queryKey: ["predictions", params.id],
    queryFn: () => fetchPredictions(params.id),
    enabled: tab === "prediction",
    staleTime: 60 * 60 * 1000,
  });

  const { data: injuries } = useQuery({
    queryKey: ["injuries", params.id],
    queryFn: () => fetchInjuries(params.id),
    enabled: tab === "injuries",
    staleTime: 60 * 60 * 1000,
  });

  if (isLoading) return <div className="space-y-4"><MatchCardSkeleton /><MatchCardSkeleton /></div>;
  if (error || !match) return <div className="card text-center py-12 text-danger">Jogo não encontrado</div>;

  const isLive = match.status === "IN_PLAY" || match.status === "PAUSED";
  const isFinished = match.status === "FINISHED";

  const tabs: Array<{ key: Tab; label: string; icon: React.ReactNode }> = [
    { key: "stats", label: "Estatísticas", icon: <TrendingUp className="h-4 w-4" /> },
    { key: "h2h", label: "H2H", icon: <GitCompare className="h-4 w-4" /> },
    { key: "prediction", label: "Previsão", icon: <Brain className="h-4 w-4" /> },
    { key: "injuries", label: "Lesões", icon: <AlertTriangle className="h-4 w-4" /> },
    { key: "odds", label: "Odds", icon: null },
  ];

  return (
    <div className="space-y-6">
      {/* Hero */}
      <div className="card text-center space-y-4">
        <p className="text-xs text-muted uppercase tracking-wider">{match.competition.name}</p>
        <div className="flex items-center justify-center gap-8">
          <div className="flex flex-col items-center gap-2 flex-1">
            {match.homeTeam.crest && (
              <Image src={match.homeTeam.crest} alt={match.homeTeam.name} width={56} height={56} unoptimized />
            )}
            <span className="font-bold text-lg">{match.homeTeam.name}</span>
          </div>

          <div className="text-center shrink-0">
            {isFinished || isLive ? (
              <div>
                <div className={cn("text-4xl font-black", isLive && "text-red-400")}>
                  {match.score.fullTime.home} – {match.score.fullTime.away}
                </div>
                {isLive && <div className="text-xs text-red-400 animate-pulse mt-1">AO VIVO</div>}
                {isFinished && match.score.halfTime.home !== null && (
                  <div className="text-xs text-muted mt-1">
                    Intervalo: {match.score.halfTime.home}–{match.score.halfTime.away}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-1">
                <div className="text-3xl font-black text-muted">vs</div>
                <div className="flex items-center gap-1 text-sm text-muted">
                  <Clock className="h-3 w-3" />
                  {formatDate(match.utcDate)}
                </div>
              </div>
            )}
          </div>

          <div className="flex flex-col items-center gap-2 flex-1">
            {match.awayTeam.crest && (
              <Image src={match.awayTeam.crest} alt={match.awayTeam.name} width={56} height={56} unoptimized />
            )}
            <span className="font-bold text-lg">{match.awayTeam.name}</span>
          </div>
        </div>

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

      {/* Tabs */}
      <div className="border-b border-slate-700">
        <div className="flex gap-1 overflow-x-auto">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                tab === t.key
                  ? "border-accent text-accent"
                  : "border-transparent text-muted hover:text-slate-100"
              )}
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab content */}
      {tab === "stats" && (
        <div className="space-y-6">
          {match.homeSeasonStats && match.awaySeasonStats && (
            <>
              {/* Home / Away / Overall splits table */}
              <div className="card overflow-x-auto">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Desempenho na Temporada</h3>
                <TeamSplitsTable home={match.homeSeasonStats} away={match.awaySeasonStats} />
              </div>

              {/* 1st half / 2nd half */}
              {(match.homeSeasonStats.firstHalfGoalsFor != null || match.homeSeasonStats.secondHalfGoalsFor != null) && (
                <div className="card overflow-x-auto">
                  <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Gols por Tempo</h3>
                  <HalfTimeTable home={match.homeSeasonStats} away={match.awaySeasonStats} />
                </div>
              )}

              {/* Chart */}
              <div className="card">
                <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Comparação Visual</h3>
                <StatsChart home={match.homeSeasonStats} away={match.awaySeasonStats} />
              </div>
            </>
          )}

          {(match.homeTopPlayers.length > 0 || match.awayTopPlayers.length > 0) && (
            <div className="card space-y-6">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Top Jogadores</h3>
              <PlayerStatsTable players={match.homeTopPlayers} title={match.homeTeam.name} />
              <PlayerStatsTable players={match.awayTopPlayers} title={match.awayTeam.name} />
            </div>
          )}

          {(match.homeLineup || match.awayLineup) && (
            <div className="card">
              <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Escalações</h3>
              <div className="grid md:grid-cols-2 gap-6">
                {match.homeLineup && (
                  <div>
                    <p className="text-sm font-medium mb-2">{match.homeTeam.name} <span className="text-muted">{match.homeLineup.formation}</span></p>
                    <ul className="space-y-1">
                      {match.homeLineup.players.map((p) => (
                        <li key={p.playerId} className="flex items-center gap-2 text-sm">
                          <span className="w-5 text-center text-xs text-muted">{p.jerseyNumber}</span>
                          <span>{p.name}</span>
                          {p.captain && <span className="badge bg-yellow-900 text-yellow-300 text-[10px]">C</span>}
                          <span className="text-[10px] text-muted ml-auto">{p.position}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {match.awayLineup && (
                  <div>
                    <p className="text-sm font-medium mb-2">{match.awayTeam.name} <span className="text-muted">{match.awayLineup.formation}</span></p>
                    <ul className="space-y-1">
                      {match.awayLineup.players.map((p) => (
                        <li key={p.playerId} className="flex items-center gap-2 text-sm">
                          <span className="w-5 text-center text-xs text-muted">{p.jerseyNumber}</span>
                          <span>{p.name}</span>
                          {p.captain && <span className="badge bg-yellow-900 text-yellow-300 text-[10px]">C</span>}
                          <span className="text-[10px] text-muted ml-auto">{p.position}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {!match.homeSeasonStats && !match.homeTopPlayers.length && !match.homeLineup && (
            <div className="card text-center py-8 text-muted text-sm">
              Estatísticas detalhadas não disponíveis. Configure API_FOOTBALL_KEY no backend para habilitar.
            </div>
          )}
        </div>
      )}

      {tab === "h2h" && (
        <div className="card">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Histórico H2H</h3>
          {!h2h ? (
            <p className="text-muted text-sm">Carregando... (requer API-Football key)</p>
          ) : (
            <H2HView h2h={h2h as H2HData} homeTeam={match.homeTeam.name} awayTeam={match.awayTeam.name} />
          )}
        </div>
      )}

      {tab === "prediction" && (
        <div className="card space-y-4">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted">Previsão</h3>
          {!predictions ? (
            <p className="text-muted text-sm">Carregando... (requer API-Football key)</p>
          ) : (
            <PredictionView pred={predictions as PredData} />
          )}
        </div>
      )}

      {tab === "injuries" && (
        <div className="card">
          <h3 className="text-sm font-semibold uppercase tracking-wider text-muted mb-4">Lesões / Suspensões</h3>
          {!injuries ? (
            <p className="text-muted text-sm">Carregando...</p>
          ) : injuries.length === 0 ? (
            <p className="text-muted text-sm">Nenhuma lesão registrada para este jogo.</p>
          ) : (
            <ul className="space-y-2">
              {(injuries as InjuryData[]).map((inj, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <span className="badge bg-red-900 text-red-300">{inj.player.type}</span>
                  <span className="font-medium">{inj.player.name}</span>
                  <span className="text-muted">({inj.team.name})</span>
                  <span className="text-muted ml-auto text-xs">{inj.player.reason}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {tab === "odds" && (
        <div className="card">
          {match.odds ? <OddsTable odds={match.odds} /> : <p className="text-muted text-sm">Odds não disponíveis</p>}
        </div>
      )}
    </div>
  );
}

// ── Stats sub-components ───────────────────────────────────────────────────
import type { TeamSeasonStats } from "@analise-futebol/shared";

function TeamSplitsTable({ home, away }: { home: TeamSeasonStats; away: TeamSeasonStats }) {
  const row = (label: string, hVal: number | string | undefined, aVal: number | string | undefined) => (
    <tr key={label} className="border-b border-slate-700/40 hover:bg-surface-2/30">
      <td className="py-2 px-3 text-sm font-semibold text-green-400">{fmt(hVal)}</td>
      <td className="py-2 px-3 text-sm text-center text-muted text-xs">{label}</td>
      <td className="py-2 px-3 text-sm font-semibold text-blue-400 text-right">{fmt(aVal)}</td>
    </tr>
  );

  const fmt = (v: number | string | undefined) => (v == null || v === "" ? "—" : v);

  return (
    <table className="w-full">
      <thead>
        <tr className="text-xs text-muted">
          <th className="pb-2 px-3 text-left text-green-400">{home.teamName}</th>
          <th className="pb-2 px-3 text-center">Stat</th>
          <th className="pb-2 px-3 text-right text-blue-400">{away.teamName}</th>
        </tr>
      </thead>
      <tbody>
        {row("Jogos", home.gamesPlayed, away.gamesPlayed)}
        {row("V / E / D", `${home.wins ?? "—"}/${home.draws ?? "—"}/${home.losses ?? "—"}`, `${away.wins ?? "—"}/${away.draws ?? "—"}/${away.losses ?? "—"}`)}
        {row("Gols (geral)", `${home.goalsScored ?? "—"}/${home.goalsConceded ?? "—"}`, `${away.goalsScored ?? "—"}/${away.goalsConceded ?? "—"}`)}
        {row("Média gols/jogo", home.avgGoalsFor?.toFixed(2), away.avgGoalsFor?.toFixed(2))}
        {row("Média sofre/jogo", home.avgGoalsAgainst?.toFixed(2), away.avgGoalsAgainst?.toFixed(2))}
        {row("Em casa V/E/D", `${home.homeWins ?? "—"}/${home.homeDraws ?? "—"}/${home.homeLosses ?? "—"}`, `${away.homeWins ?? "—"}/${away.homeDraws ?? "—"}/${away.homeLosses ?? "—"}`)}
        {row("Gols em casa/jogo", home.homeAvgGoalsFor?.toFixed(2), away.homeAvgGoalsFor?.toFixed(2))}
        {row("Sofre em casa/jogo", home.homeAvgGoalsAgainst?.toFixed(2), away.homeAvgGoalsAgainst?.toFixed(2))}
        {row("Fora V/E/D", `${home.awayWins ?? "—"}/${home.awayDraws ?? "—"}/${home.awayLosses ?? "—"}`, `${away.awayWins ?? "—"}/${away.awayDraws ?? "—"}/${away.awayLosses ?? "—"}`)}
        {row("Gols fora/jogo", home.awayAvgGoalsFor?.toFixed(2), away.awayAvgGoalsFor?.toFixed(2))}
        {row("Sofre fora/jogo", home.awayAvgGoalsAgainst?.toFixed(2), away.awayAvgGoalsAgainst?.toFixed(2))}
        {row("Clean sheets", home.cleanSheets, away.cleanSheets)}
        {row("CS em casa / fora", `${home.homeCleanSheets ?? "—"} / ${home.awayCleanSheets ?? "—"}`, `${away.homeCleanSheets ?? "—"} / ${away.awayCleanSheets ?? "—"}`)}
      </tbody>
    </table>
  );
}

function HalfTimeTable({ home, away }: { home: TeamSeasonStats; away: TeamSeasonStats }) {
  const gp_h = home.gamesPlayed ?? 1;
  const gp_a = away.gamesPlayed ?? 1;

  const rows = [
    {
      label: "1º Tempo — gols marcados",
      home: home.firstHalfGoalsFor != null ? `${home.firstHalfGoalsFor} (${(home.firstHalfGoalsFor / gp_h).toFixed(2)}/j)` : "—",
      away: away.firstHalfGoalsFor != null ? `${away.firstHalfGoalsFor} (${(away.firstHalfGoalsFor / gp_a).toFixed(2)}/j)` : "—",
    },
    {
      label: "1º Tempo — gols sofridos",
      home: home.firstHalfGoalsAgainst != null ? `${home.firstHalfGoalsAgainst} (${(home.firstHalfGoalsAgainst / gp_h).toFixed(2)}/j)` : "—",
      away: away.firstHalfGoalsAgainst != null ? `${away.firstHalfGoalsAgainst} (${(away.firstHalfGoalsAgainst / gp_a).toFixed(2)}/j)` : "—",
    },
    {
      label: "2º Tempo — gols marcados",
      home: home.secondHalfGoalsFor != null ? `${home.secondHalfGoalsFor} (${(home.secondHalfGoalsFor / gp_h).toFixed(2)}/j)` : "—",
      away: away.secondHalfGoalsFor != null ? `${away.secondHalfGoalsFor} (${(away.secondHalfGoalsFor / gp_a).toFixed(2)}/j)` : "—",
    },
    {
      label: "2º Tempo — gols sofridos",
      home: home.secondHalfGoalsAgainst != null ? `${home.secondHalfGoalsAgainst} (${(home.secondHalfGoalsAgainst / gp_a).toFixed(2)}/j)` : "—",
      away: away.secondHalfGoalsAgainst != null ? `${away.secondHalfGoalsAgainst} (${(away.secondHalfGoalsAgainst / gp_a).toFixed(2)}/j)` : "—",
    },
  ];

  return (
    <table className="w-full">
      <thead>
        <tr className="text-xs text-muted">
          <th className="pb-2 px-3 text-left text-green-400">{home.teamName}</th>
          <th className="pb-2 px-3 text-center">Período</th>
          <th className="pb-2 px-3 text-right text-blue-400">{away.teamName}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(({ label, home: h, away: a }) => (
          <tr key={label} className="border-b border-slate-700/40 hover:bg-surface-2/30">
            <td className="py-2 px-3 text-sm font-semibold text-green-400">{h}</td>
            <td className="py-2 px-3 text-xs text-muted text-center">{label}</td>
            <td className="py-2 px-3 text-sm font-semibold text-blue-400 text-right">{a}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// ── Sub-components ─────────────────────────────────────────────────────────
interface H2HData { total: number; homeWins: number; awayWins: number; draws: number; over25Pct: number; bttsPct: number; recentFixtures: Array<{ date: string; homeTeam: string; awayTeam: string; homeGoals: number | null; awayGoals: number | null; status: string }> }
interface PredData { apiFootball?: { predictions?: { advice: string; percent?: { home: string; draw: string; away: string }; under_over?: string; winner?: { name: string } } }; ourModel?: { homeWin?: number; draw?: number; awayWin?: number }; valuePicks?: unknown[] }
interface InjuryData { player: { name: string; type: string; reason: string }; team: { name: string } }

function H2HView({ h2h, homeTeam, awayTeam }: { h2h: H2HData; homeTeam: string; awayTeam: string }) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4 text-center">
        <div><div className="text-2xl font-bold text-accent">{h2h.homeWins}</div><div className="text-xs text-muted">{homeTeam}</div></div>
        <div><div className="text-2xl font-bold">{h2h.draws}</div><div className="text-xs text-muted">Empates</div></div>
        <div><div className="text-2xl font-bold text-blue-400">{h2h.awayWins}</div><div className="text-xs text-muted">{awayTeam}</div></div>
      </div>
      <div className="flex gap-4 text-sm text-muted">
        <span>+2.5 gols: <strong className="text-slate-200">{formatPct(h2h.over25Pct)}</strong></span>
        <span>Ambas marcam: <strong className="text-slate-200">{formatPct(h2h.bttsPct)}</strong></span>
      </div>
      <div className="space-y-2">
        {h2h.recentFixtures.map((f, i) => (
          <div key={i} className="flex items-center justify-between text-sm bg-surface-2 rounded-lg px-3 py-2">
            <span className="text-muted text-xs">{new Date(f.date).toLocaleDateString("pt-BR")}</span>
            <span>{f.homeTeam}</span>
            <span className="font-bold">{f.homeGoals} – {f.awayGoals}</span>
            <span>{f.awayTeam}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function PredictionView({ pred }: { pred: PredData }) {
  const af = pred.apiFootball?.predictions;
  const our = pred.ourModel;
  return (
    <div className="space-y-4">
      {our && (
        <div>
          <p className="text-xs text-muted uppercase tracking-wider mb-2">Nosso Modelo (Poisson + Elo)</p>
          <div className="grid grid-cols-3 gap-3">
            {[
              { label: "Casa", value: our.homeWin },
              { label: "Empate", value: our.draw },
              { label: "Fora", value: our.awayWin },
            ].map((item) => (
              <div key={item.label} className="bg-surface-2 rounded-lg p-3 text-center">
                <div className="text-lg font-bold text-accent">{item.value ? formatPct(item.value) : "—"}</div>
                <div className="text-xs text-muted">{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {af && (
        <div>
          <p className="text-xs text-muted uppercase tracking-wider mb-2">API-Football</p>
          {af.advice && <p className="text-sm mb-2">💡 {af.advice}</p>}
          {af.percent && (
            <div className="grid grid-cols-3 gap-3">
              {[
                { label: "Casa", value: af.percent.home },
                { label: "Empate", value: af.percent.draw },
                { label: "Fora", value: af.percent.away },
              ].map((item) => (
                <div key={item.label} className="bg-surface-2 rounded-lg p-3 text-center">
                  <div className="text-lg font-bold">{item.value ?? "—"}</div>
                  <div className="text-xs text-muted">{item.label}</div>
                </div>
              ))}
            </div>
          )}
          {af.under_over && <p className="text-sm text-muted mt-2">Gols: {af.under_over}</p>}
        </div>
      )}
      {!af && !our && <p className="text-muted text-sm">Previsões não disponíveis</p>}
    </div>
  );
}
