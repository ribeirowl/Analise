import { cache, TTL } from "../cache";
import { logger } from "../logger";
import type { TeamSeasonStats } from "@analise-futebol/shared";

const PY_BASE = process.env.PYTHON_SERVICE_URL ?? "http://localhost:3002";

const LEAGUE_SLUG: Record<string, string> = {
  "Premier League":             "epl",
  "La Liga":                    "laliga",
  "Serie A":                    "seriea",
  "Bundesliga":                 "bundesliga",
  "Ligue 1":                    "ligue1",
  "Championship":               "championship",
  "Brasileirão Série A":        "brasileirao",
  "UEFA Champions League":      "ucl",
  "UEFA Europa League":         "uel",
};

interface PyTeamStat {
  teamName: string;
  league: string;
  gamesPlayed?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalsScored?: number;
  goalsConceded?: number;
  homeGoalsScored?: number;
  homeGoalsConceded?: number;
  awayGoalsScored?: number;
  awayGoalsConceded?: number;
  avgGoalsFor?: number;
  avgGoalsAgainst?: number;
  homeAvgGoalsFor?: number;
  awayAvgGoalsFor?: number;
  xgFor?: number;
  xgAgainst?: number;
  avgXgFor?: number;
}

async function fetchPy<T>(path: string, ttlMs: number): Promise<T | null> {
  const cacheKey = `py:${path}`;
  const cached = cache.get<T>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${PY_BASE}${path}`, { signal: AbortSignal.timeout(15_000) });
    if (!res.ok) return null;
    const data = await res.json() as T;
    cache.set(cacheKey, data, ttlMs);
    return data;
  } catch (err) {
    logger.debug("Python service unavailable", { path, err: String(err) });
    return null;
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Fetch all team stats for a competition from FBRef via Python service. */
export async function getLeagueTeamStats(
  competitionName: string
): Promise<PyTeamStat[]> {
  const slug = LEAGUE_SLUG[competitionName];
  if (!slug) return [];

  const result = await fetchPy<{ teams: PyTeamStat[] }>(
    `/team-stats/${slug}`,
    TTL.FOOTBALL_DATA_TEAM
  );
  return result?.teams ?? [];
}

/** Find a single team's stats by fuzzy name match. */
export function findTeamStats(
  allStats: PyTeamStat[],
  teamName: string
): PyTeamStat | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const target = norm(teamName);
  return (
    allStats.find((t) => norm(t.teamName) === target) ??
    allStats.find((t) => norm(t.teamName).includes(target.slice(0, 6)) || target.includes(norm(t.teamName).slice(0, 6))) ??
    null
  );
}

/** Convert PyTeamStat into shared TeamSeasonStats format. */
export function pyToTeamSeasonStats(s: PyTeamStat, teamId = 0): TeamSeasonStats {
  const gp = s.gamesPlayed ?? 1;
  return {
    teamId,
    teamName: s.teamName,
    competitionId: 0,
    gamesPlayed: s.gamesPlayed,
    wins: s.wins,
    draws: s.draws,
    losses: s.losses,
    goalsScored: s.goalsScored,
    goalsConceded: s.goalsConceded,
    avgGoalsFor: s.avgGoalsFor ?? (s.goalsScored ? s.goalsScored / gp : undefined),
    avgGoalsAgainst: s.avgGoalsAgainst ?? (s.goalsConceded ? s.goalsConceded / gp : undefined),
    homeGoalsScored: s.homeGoalsScored,
    homeGoalsConceded: s.homeGoalsConceded,
    awayGoalsScored: s.awayGoalsScored,
    awayGoalsConceded: s.awayGoalsConceded,
    homeAvgGoalsFor: s.homeAvgGoalsFor,
    awayAvgGoalsFor: s.awayAvgGoalsFor,
  };
}

/** Check whether the Python service is reachable. */
export async function isPyServiceUp(): Promise<boolean> {
  try {
    const res = await fetch(`${PY_BASE}/health`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}
