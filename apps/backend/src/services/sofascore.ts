import { config } from "../config";
import { cache, TTL } from "../cache";
import { logger } from "../logger";
import type { PlayerStats, Lineup, TeamSeasonStats } from "@analise-futebol/shared";

const BASE_URL = "https://api.sofascore.com/api/v1";

async function fetchSS<T>(path: string, ttlMs: number): Promise<T> {
  const cacheKey = `ss:${path}`;
  const cached = cache.get<T>(cacheKey);
  if (cached) return cached;

  let attempt = 0;
  while (attempt < 3) {
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        headers: {
          "User-Agent": config.SOFASCORE_USER_AGENT,
          Accept: "application/json",
          "Accept-Language": "pt-BR,pt;q=0.9,en;q=0.8",
          Referer: "https://www.sofascore.com/",
        },
      });

      if (res.status === 429 || res.status === 503) {
        await sleep(3000 * (attempt + 1));
        attempt++;
        continue;
      }

      if (!res.ok) {
        throw new Error(`Sofascore ${res.status} ${res.statusText} — ${path}`);
      }

      const data = (await res.json()) as T;
      cache.set(cacheKey, data, ttlMs);
      return data;
    } catch (err) {
      attempt++;
      if (attempt >= 3) throw err;
      await sleep(2 ** attempt * 1500);
    }
  }
  throw new Error("Sofascore: max retries exceeded");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Scheduled events (all sports) ────────────────────────────────────────
export interface SofascoreEvent {
  id: number;
  homeTeam: { id: number; name: string };
  awayTeam: { id: number; name: string };
  startTimestamp: number;
  status: { type: string; description: string };
  tournament: {
    id: number;
    name: string;
    category: { id: number; name: string; country?: { name: string } };
    uniqueTournament?: { id: number; seasons?: Array<{ id: number }> };
  };
  homeScore?: { current: number };
  awayScore?: { current: number };
  venue?: { city?: { name: string }; stadium?: { name: string } };
}

export async function getScheduledEvents(date: string): Promise<SofascoreEvent[]> {
  try {
    const raw = await fetchSS<{ events: SofascoreEvent[] }>(
      `/sport/football/scheduled-events/${date}`,
      TTL.SOFASCORE_EVENT
    );
    return raw.events ?? [];
  } catch (err) {
    logger.warn("Sofascore getScheduledEvents failed", { date, err: String(err) });
    return [];
  }
}

// ─── Lineups ───────────────────────────────────────────────────────────────
interface SSLineupPlayer {
  player: { id: number; name: string; position?: string };
  jerseyNumber?: number;
  captain?: boolean;
}

interface SSLineupResponse {
  home: { players: SSLineupPlayer[]; formation?: string; supportStaff?: Array<{ staff: { name: string }; role: string }> };
  away: { players: SSLineupPlayer[]; formation?: string; supportStaff?: Array<{ staff: { name: string }; role: string }> };
}

export async function getLineups(
  eventId: number
): Promise<{ home: Lineup; away: Lineup } | null> {
  try {
    const raw = await fetchSS<SSLineupResponse>(
      `/event/${eventId}/lineups`,
      TTL.SOFASCORE_LINEUPS
    );
    return {
      home: normalizeLineup(raw.home),
      away: normalizeLineup(raw.away),
    };
  } catch (err) {
    logger.warn("Sofascore getLineups failed", { eventId, err: String(err) });
    return null;
  }
}

interface SSLineupResponse {
  home: {
    players: SSLineupPlayer[];
    formation?: string;
    supportStaff?: Array<{ staff: { name: string }; role: string }>;
  };
  away: {
    players: SSLineupPlayer[];
    formation?: string;
    supportStaff?: Array<{ staff: { name: string }; role: string }>;
  };
}

function normalizeLineup(side: SSLineupResponse["home"]): Lineup {
  const coach = side.supportStaff?.find((s) => s.role === "manager")?.staff.name;
  return {
    formation: side.formation,
    coach,
    players: (side.players ?? []).map((p) => ({
      playerId: p.player.id,
      name: p.player.name,
      position: p.player.position,
      jerseyNumber: p.jerseyNumber,
      captain: p.captain,
    })),
  };
}

// ─── Team Top Players ──────────────────────────────────────────────────────
interface SSPlayerStat {
  player: { id: number; name: string };
  statistics: Record<string, number>;
}

const STAT_CATEGORIES = [
  "rating",
  "goals",
  "expectedGoals",
  "assists",
  "expectedAssists",
  "totalShots",
  "shotsOnTarget",
  "tackles",
  "interceptions",
  "successfulDribbles",
  "keyPasses",
  "yellowCards",
  "redCards",
  "saves",
];

export async function getTeamTopPlayers(
  teamId: number,
  tournamentId: number,
  seasonId: number
): Promise<PlayerStats[]> {
  const results = new Map<number, PlayerStats>();

  // Fetch top players for the most important stat categories
  const categoriesToFetch = ["goals", "rating", "totalShots", "tackles"];

  await Promise.allSettled(
    categoriesToFetch.map(async (category) => {
      try {
        const raw = await fetchSS<{ topPlayers: SSPlayerStat[] }>(
          `/team/${teamId}/unique-tournament/${tournamentId}/season/${seasonId}/top-players/${category}`,
          TTL.SOFASCORE_STATS
        );
        for (const entry of raw.topPlayers ?? []) {
          const existing = results.get(entry.player.id) ?? { playerId: entry.player.id, name: entry.player.name };
          results.set(entry.player.id, mergeStats(existing, entry.statistics));
        }
      } catch {
        // silently skip failed categories
      }
    })
  );

  return Array.from(results.values());
}

function mergeStats(base: PlayerStats, stats: Record<string, number>): PlayerStats {
  return {
    ...base,
    rating: stats.rating ?? base.rating,
    goals: stats.goals ?? base.goals,
    assists: stats.assists ?? base.assists,
    totalShots: stats.totalShots ?? base.totalShots,
    shotsOnTarget: stats.shotsOnTarget ?? base.shotsOnTarget,
    tackles: stats.tackles ?? base.tackles,
    interceptions: stats.interceptions ?? base.interceptions,
    keyPasses: stats.keyPasses ?? base.keyPasses,
    successfulDribbles: stats.successfulDribbles ?? base.successfulDribbles,
    yellowCards: stats.yellowCards ?? base.yellowCards,
    redCards: stats.redCards ?? base.redCards,
    saves: stats.saves ?? base.saves,
    expectedGoals: stats.expectedGoals ?? base.expectedGoals,
    expectedAssists: stats.expectedAssists ?? base.expectedAssists,
  };
}

// ─── Team Season Stats ─────────────────────────────────────────────────────
export async function getTeamSeasonStats(
  teamId: number,
  tournamentId: number,
  seasonId: number
): Promise<TeamSeasonStats | null> {
  try {
    const raw = await fetchSS<{ statistics: Record<string, number> }>(
      `/team/${teamId}/unique-tournament/${tournamentId}/season/${seasonId}/statistics/overall`,
      TTL.SOFASCORE_STATS
    );
    const s = raw.statistics;
    return {
      teamId,
      teamName: "",
      competitionId: tournamentId,
      goalsScored: s.goals,
      goalsConceded: s.goalsConcededTotal,
      avgShotsFor: s.avgShotsOnTarget,
      avgPossession: s.avgBallPossession,
      avgCorners: s.avgCorners,
      avgFoulsCommitted: s.avgFoulsCommitted,
      avgYellowCards: s.avgYellowCards,
      wins: s.wins,
      draws: s.draws,
      losses: s.losses,
      gamesPlayed: s.matchesPlayed,
    };
  } catch (err) {
    logger.warn("Sofascore getTeamSeasonStats failed", { teamId, err: String(err) });
    return null;
  }
}

// ─── Event details ─────────────────────────────────────────────────────────
export async function getEventDetails(eventId: number): Promise<SofascoreEvent | null> {
  try {
    const raw = await fetchSS<{ event: SofascoreEvent }>(
      `/event/${eventId}`,
      TTL.SOFASCORE_EVENT
    );
    return raw.event;
  } catch {
    return null;
  }
}
