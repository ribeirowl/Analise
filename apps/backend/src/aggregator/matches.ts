import { cache, TTL } from "../cache";
import { logger } from "../logger";
import { getTodayMatches } from "../services/footballData";
import { getScheduledEvents, getLineups, getTeamTopPlayers, getTeamSeasonStats } from "../services/sofascore";
import { getAllFootballOdds, normalizeOdds, findOddsEvent } from "../services/theOddsApi";
import { getSofascoreTeamId } from "./teamMapper";
import { findValuePicks } from "./valueFinder";
import type { EnrichedMatch, Match } from "@analise-futebol/shared";

export async function getEnrichedTodayMatches(date?: string): Promise<EnrichedMatch[]> {
  const today = date ?? new Date().toISOString().slice(0, 10);
  const cacheKey = `enriched:${today}`;
  const cached = cache.get<EnrichedMatch[]>(cacheKey);
  if (cached) return cached;

  logger.info(`Fetching enriched matches for ${today}`);

  // Parallel: fetch from all sources
  const [fdMatches, ssEvents, allOddsEvents] = await Promise.all([
    getTodayMatches(today),
    getScheduledEvents(today),
    getAllFootballOdds(),
  ]);

  const oddsMap = normalizeOdds(allOddsEvents);

  // Enrich each match
  const enriched = await Promise.all(
    fdMatches.map((match) => enrichMatch(match, ssEvents, allOddsEvents, oddsMap))
  );

  cache.set(cacheKey, enriched, TTL.ENRICHED_MATCH);
  return enriched;
}

export async function getEnrichedMatch(id: string): Promise<EnrichedMatch | null> {
  const cacheKey = `enriched:single:${id}`;
  const cached = cache.get<EnrichedMatch>(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  const all = await getEnrichedTodayMatches(today);
  return all.find((m) => m.id === id) ?? null;
}

async function enrichMatch(
  match: Match,
  ssEvents: Awaited<ReturnType<typeof getScheduledEvents>>,
  allOddsEvents: Parameters<typeof normalizeOdds>[0],
  oddsMap: ReturnType<typeof normalizeOdds>
): Promise<EnrichedMatch> {
  const base: EnrichedMatch = {
    ...match,
    odds: null,
    homeLineup: null,
    awayLineup: null,
    homeTopPlayers: [],
    awayTopPlayers: [],
    homeSeasonStats: null,
    awaySeasonStats: null,
    valuePicks: [],
    lastEnriched: new Date().toISOString(),
  };

  // ── Match Sofascore event ────────────────────────────────────────────────
  const homeSsId = getSofascoreTeamId(match.homeTeam.id, match.homeTeam.name, ssEvents);
  const awaySsId = getSofascoreTeamId(match.awayTeam.id, match.awayTeam.name, ssEvents);

  const ssEvent = ssEvents.find(
    (ev) =>
      (homeSsId && ev.homeTeam.id === homeSsId) ||
      (awaySsId && ev.awayTeam.id === awaySsId) ||
      (ev.homeTeam.name.toLowerCase().includes(match.homeTeam.name.toLowerCase().slice(0, 4)) &&
        ev.awayTeam.name.toLowerCase().includes(match.awayTeam.name.toLowerCase().slice(0, 4)))
  );

  if (ssEvent) {
    base.sofascoreId = ssEvent.id;

    // Fetch lineups + stats in parallel (best-effort)
    const [lineups, homeStats, awayStats] = await Promise.all([
      getLineups(ssEvent.id),
      homeSsId && ssEvent.tournament.uniqueTournament?.id
        ? getTeamSeasonStats(
            homeSsId,
            ssEvent.tournament.uniqueTournament.id,
            ssEvent.tournament.uniqueTournament.seasons?.[0]?.id ?? 0
          )
        : Promise.resolve(null),
      awaySsId && ssEvent.tournament.uniqueTournament?.id
        ? getTeamSeasonStats(
            awaySsId,
            ssEvent.tournament.uniqueTournament.id,
            ssEvent.tournament.uniqueTournament.seasons?.[0]?.id ?? 0
          )
        : Promise.resolve(null),
    ]);

    if (lineups) {
      base.homeLineup = lineups.home;
      base.awayLineup = lineups.away;
    }

    if (homeStats) {
      base.homeSeasonStats = { ...homeStats, teamName: match.homeTeam.name };
    }
    if (awayStats) {
      base.awaySeasonStats = { ...awayStats, teamName: match.awayTeam.name };
    }

    // Top players (async, don't block)
    if (
      homeSsId &&
      awaySsId &&
      ssEvent.tournament.uniqueTournament?.id &&
      ssEvent.tournament.uniqueTournament?.seasons?.[0]?.id
    ) {
      const tid = ssEvent.tournament.uniqueTournament.id;
      const sid = ssEvent.tournament.uniqueTournament.seasons[0].id;
      const [homePlayers, awayPlayers] = await Promise.all([
        getTeamTopPlayers(homeSsId, tid, sid),
        getTeamTopPlayers(awaySsId, tid, sid),
      ]);
      base.homeTopPlayers = homePlayers;
      base.awayTopPlayers = awayPlayers;
    }
  }

  // ── Match Odds ────────────────────────────────────────────────────────────
  const oddsEvent = findOddsEvent(match.homeTeam.name, match.awayTeam.name, allOddsEvents);
  if (oddsEvent) {
    base.oddsApiEventId = oddsEvent.id;
    base.odds = oddsMap.get(oddsEvent.id) ?? null;
  }

  // ── Value picks ───────────────────────────────────────────────────────────
  base.valuePicks = findValuePicks(base);

  return base;
}

