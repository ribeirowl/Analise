import { config } from "../config";
import { cache, TTL } from "../cache";
import { logger } from "../logger";
import type { Match, Competition, Team } from "@analise-futebol/shared";

const BASE_URL = "https://api.football-data.org/v4";

async function fetchFD<T>(path: string, ttlMs: number): Promise<T> {
  const cacheKey = `fd:${path}`;
  const cached = cache.get<T>(cacheKey);
  if (cached) return cached;

  let attempt = 0;
  while (attempt < 3) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: { "X-Auth-Token": config.FOOTBALL_DATA_API_KEY },
      });

      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After") ?? 60);
        logger.warn(`football-data.org rate limited — waiting ${retryAfter}s`);
        await sleep(retryAfter * 1000);
        attempt++;
        continue;
      }

      if (!res.ok) {
        throw new Error(`football-data.org ${res.status} ${res.statusText} — ${path}`);
      }

      const data = (await res.json()) as T;
      cache.set(cacheKey, data, ttlMs);
      return data;
    } catch (err) {
      attempt++;
      if (attempt >= 3) throw err;
      await sleep(2 ** attempt * 1000);
    }
  }
  throw new Error("football-data.org: max retries exceeded");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Types from football-data.org ─────────────────────────────────────────
interface FDMatch {
  id: number;
  utcDate: string;
  status: string;
  competition: { id: number; name: string; code: string; emblem?: string };
  homeTeam: { id: number; name: string; shortName?: string; crest?: string };
  awayTeam: { id: number; name: string; shortName?: string; crest?: string };
  score: {
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  venue?: string;
  referees?: Array<{ name: string }>;
}

interface FDMatchesResponse {
  matches: FDMatch[];
}

// ─── Public API ────────────────────────────────────────────────────────────
export async function getTodayMatches(date?: string): Promise<Match[]> {
  const today = date ?? new Date().toISOString().slice(0, 10);
  const path = `/matches?dateFrom=${today}&dateTo=${today}`;
  const raw = await fetchFD<FDMatchesResponse>(path, TTL.FOOTBALL_DATA_MATCHES);
  return raw.matches.map(normalizeMatch);
}

export async function getMatchById(id: number): Promise<Match | null> {
  try {
    const raw = await fetchFD<FDMatch>(`/matches/${id}`, TTL.FOOTBALL_DATA_MATCHES);
    return normalizeMatch(raw);
  } catch {
    return null;
  }
}

export async function getTeam(id: number): Promise<Team | null> {
  try {
    const raw = await fetchFD<{
      id: number;
      name: string;
      shortName?: string;
      crest?: string;
    }>(`/teams/${id}`, TTL.FOOTBALL_DATA_TEAM);
    return { id: raw.id, name: raw.name, shortName: raw.shortName, crest: raw.crest };
  } catch {
    return null;
  }
}

export async function getStandings(competitionId: number) {
  return fetchFD(`/competitions/${competitionId}/standings`, TTL.FOOTBALL_DATA_TEAM);
}

function normalizeMatch(m: FDMatch): Match {
  return {
    id: String(m.id),
    competition: {
      id: m.competition.id,
      name: m.competition.name,
      code: m.competition.code,
      emblem: m.competition.emblem,
    },
    homeTeam: {
      id: m.homeTeam.id,
      name: m.homeTeam.name,
      shortName: m.homeTeam.shortName,
      crest: m.homeTeam.crest,
    },
    awayTeam: {
      id: m.awayTeam.id,
      name: m.awayTeam.name,
      shortName: m.awayTeam.shortName,
      crest: m.awayTeam.crest,
    },
    utcDate: m.utcDate,
    status: m.status as Match["status"],
    score: {
      fullTime: { home: m.score.fullTime.home, away: m.score.fullTime.away },
      halfTime: { home: m.score.halfTime.home, away: m.score.halfTime.away },
    },
    referee: m.referees?.[0]?.name,
  };
}
