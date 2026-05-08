import { config } from "../config";
import { cache, TTL } from "../cache";
import { logger } from "../logger";

const BASE = config.API_FOOTBALL_BASE_URL;

// Quota tracking
let requestsRemaining: number | null = null;
let requestsUsed: number | null = null;

export function getApiFootballQuota() {
  return { requestsRemaining, requestsUsed };
}

async function fetchAF<T>(path: string, ttlMs: number): Promise<T | null> {
  if (!config.API_FOOTBALL_KEY) return null;
  const cacheKey = `af:${path}`;
  const cached = cache.get<T>(cacheKey);
  if (cached) return cached;

  try {
    const res = await fetch(`${BASE}${path}`, {
      headers: {
        "x-apisports-key": config.API_FOOTBALL_KEY,
        Accept: "application/json",
      },
    });

    const rem = res.headers.get("x-ratelimit-requests-remaining");
    const used = res.headers.get("x-ratelimit-requests-xreset");
    if (rem) requestsRemaining = Number(rem);
    if (requestsRemaining !== null && requestsRemaining < 10) {
      logger.warn(`⚠️  API-Football quota low: ${requestsRemaining} remaining today`);
    }

    if (!res.ok) throw new Error(`API-Football ${res.status} — ${path}`);
    const json = (await res.json()) as { response: T; errors: unknown[] };
    if (json.errors && Object.keys(json.errors).length > 0) {
      logger.warn("API-Football errors", json.errors);
      return null;
    }
    cache.set(cacheKey, json.response, ttlMs);
    return json.response;
  } catch (err) {
    logger.warn("API-Football request failed", { path, err: String(err) });
    return null;
  }
}

// League ID map
export const LEAGUE_IDS: Record<string, number> = {
  PL: 39, LaLiga: 140, SerieA: 135, Bundesliga: 78, Ligue1: 61,
  UCL: 2, UEL: 3, Libertadores: 13, Brasileirao: 71,
  Eredivisie: 88, PrimeiraLiga: 94, Sudamericana: 11,
};

export const CURRENT_SEASON = 2025;

// ── Fixtures for today ────────────────────────────────────────────────────
export interface AFFixture {
  fixture: {
    id: number;
    date: string;
    status: { short: string; elapsed: number | null };
    venue: { name: string | null; city: string | null };
    referee: string | null;
  };
  league: { id: number; name: string; country: string; logo: string; round: string };
  teams: {
    home: { id: number; name: string; logo: string; winner: boolean | null };
    away: { id: number; name: string; logo: string; winner: boolean | null };
  };
  goals: { home: number | null; away: number | null };
  score: {
    halftime: { home: number | null; away: number | null };
    fulltime: { home: number | null; away: number | null };
  };
}

export async function getFixturesByDate(date: string): Promise<AFFixture[]> {
  return (await fetchAF<AFFixture[]>(`/fixtures?date=${date}`, TTL.FOOTBALL_DATA_MATCHES)) ?? [];
}

// ── Team season stats ─────────────────────────────────────────────────────
export interface AFTeamStats {
  team: { id: number; name: string };
  league: { id: number };
  goals: {
    for: { average: { total: string } };
    against: { average: { total: string } };
  };
  fixtures: { wins: { total: number }; draws: { total: number }; loses: { total: number }; played: { total: number } };
  biggest: { goals: { for: { total: number }; against: { total: number } } };
  clean_sheet: { total: number };
  failed_to_score: { total: number };
}

export async function getTeamStats(teamId: number, leagueId: number): Promise<AFTeamStats | null> {
  return fetchAF<AFTeamStats>(
    `/teams/statistics?team=${teamId}&league=${leagueId}&season=${CURRENT_SEASON}`,
    24 * 60 * 60 * 1000 // 24h — changes rarely
  );
}

// ── Top scorers / assists ─────────────────────────────────────────────────
export interface AFPlayer {
  player: { id: number; name: string; photo: string };
  statistics: Array<{
    games: { appearences: number; rating: string | null };
    goals: { total: number | null; assists: number | null };
    shots: { total: number | null; on: number | null };
    tackles: { total: number | null; interceptions: number | null };
    dribbles: { success: number | null };
    passes: { key: number | null };
    cards: { yellow: number; red: number };
  }>;
}

export async function getTopPlayers(leagueId: number): Promise<AFPlayer[]> {
  return (await fetchAF<AFPlayer[]>(
    `/players/topscorers?league=${leagueId}&season=${CURRENT_SEASON}`,
    6 * 60 * 60 * 1000
  )) ?? [];
}

export async function getSquadTopStats(teamId: number, leagueId: number): Promise<AFPlayer[]> {
  return (await fetchAF<AFPlayer[]>(
    `/players?team=${teamId}&league=${leagueId}&season=${CURRENT_SEASON}&page=1`,
    6 * 60 * 60 * 1000
  )) ?? [];
}

// ── H2H ───────────────────────────────────────────────────────────────────
export async function getH2H(homeId: number, awayId: number): Promise<AFFixture[]> {
  return (await fetchAF<AFFixture[]>(
    `/fixtures/headtohead?h2h=${homeId}-${awayId}&last=10`,
    24 * 60 * 60 * 1000
  )) ?? [];
}

// ── Predictions ───────────────────────────────────────────────────────────
export interface AFPrediction {
  predictions: {
    winner: { id: number | null; name: string | null; comment: string };
    win_or_draw: boolean;
    under_over: string | null;
    goals: { home: string; away: string };
    advice: string;
    percent: { home: string; draw: string; away: string };
  };
  comparison: {
    form: { home: string; away: string };
    att: { home: string; away: string };
    def: { home: string; away: string };
    poisson_distribution: { home: string; away: string };
    h2h: { home: string; away: string };
    goals: { home: string; away: string };
    total: { home: string; away: string };
  };
}

export async function getPrediction(fixtureId: number): Promise<AFPrediction | null> {
  const res = await fetchAF<AFPrediction[]>(`/predictions?fixture=${fixtureId}`, 60 * 60 * 1000);
  return res?.[0] ?? null;
}

// ── Injuries ──────────────────────────────────────────────────────────────
export interface AFInjury {
  player: { id: number; name: string; photo: string; type: string; reason: string };
  team: { id: number; name: string };
}

export async function getInjuries(fixtureId: number): Promise<AFInjury[]> {
  return (await fetchAF<AFInjury[]>(`/injuries?fixture=${fixtureId}`, 60 * 60 * 1000)) ?? [];
}

// ── Normalize AF fixture status ───────────────────────────────────────────
export function normalizeAFStatus(short: string): string {
  const map: Record<string, string> = {
    NS: "SCHEDULED", TBD: "SCHEDULED",
    "1H": "IN_PLAY", HT: "PAUSED", "2H": "IN_PLAY", ET: "IN_PLAY", BT: "PAUSED", P: "IN_PLAY",
    FT: "FINISHED", AET: "FINISHED", PEN: "FINISHED",
    SUSP: "SUSPENDED", INT: "PAUSED", PST: "POSTPONED", CANC: "CANCELLED", ABD: "CANCELLED",
    AWD: "FINISHED", WO: "FINISHED", LIVE: "IN_PLAY",
  };
  return map[short] ?? "SCHEDULED";
}
