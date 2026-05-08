import { cache, TTL } from "../cache";
import { logger } from "../logger";
import { getScheduledEvents, getLineups, getTeamTopPlayers, getTeamSeasonStats, SofascoreEvent } from "../services/sofascore";
import { getTodayMatches } from "../services/footballData";
import { getAllFootballOdds, normalizeOdds, findOddsEvent, RawEvent } from "../services/theOddsApi";
import { findValuePicks } from "./valueFinder";
import type { EnrichedMatch, Match, Competition, Team, MatchOdds } from "@analise-futebol/shared";

// Sport key → competition name mapping
const SPORT_KEY_NAMES: Record<string, string> = {
  soccer_brazil_campeonato: "Brasileirão Série A",
  soccer_epl: "Premier League",
  soccer_spain_la_liga: "La Liga",
  soccer_italy_serie_a: "Serie A",
  soccer_germany_bundesliga: "Bundesliga",
  soccer_france_ligue_one: "Ligue 1",
  soccer_uefa_champs_league: "UEFA Champions League",
  soccer_uefa_europa_league: "UEFA Europa League",
  soccer_conmebol_copa_libertadores: "Copa Libertadores",
  soccer_portugal_primeira_liga: "Primeira Liga",
  soccer_netherlands_eredivisie: "Eredivisie",
};

// ── List: fast, uses football-data.org + The Odds API as sources ──────────
export async function getEnrichedTodayMatches(date?: string): Promise<EnrichedMatch[]> {
  const today = date ?? new Date().toISOString().slice(0, 10);
  const cacheKey = `enriched:list:${today}`;
  const cached = cache.get<EnrichedMatch[]>(cacheKey);
  if (cached) return cached;

  logger.info(`Fetching match list for ${today}`);

  const [ssEvents, fdMatches, allOddsEvents] = await Promise.all([
    getScheduledEvents(today),
    getTodayMatches(today),
    getAllFootballOdds(),
  ]);

  logger.info(`Sofascore: ${ssEvents.length} | FD: ${fdMatches.length} | OddsAPI: ${allOddsEvents.length} events`);

  const oddsMap = normalizeOdds(allOddsEvents);
  const matchMap = new Map<string, EnrichedMatch>();

  // 1. Add Sofascore matches (best source if available)
  if (ssEvents.length > 0) {
    for (const ev of ssEvents) {
      const m = buildFromSofascore(ev, allOddsEvents, oddsMap);
      matchMap.set(normalizeKey(m.homeTeam.name, m.awayTeam.name), m);
    }
  }

  // 2. Add football-data.org matches (may overlap with Sofascore or be unique)
  for (const m of fdMatches) {
    const key = normalizeKey(m.homeTeam.name, m.awayTeam.name);
    if (!matchMap.has(key)) {
      const oddsEvent = findOddsEvent(m.homeTeam.name, m.awayTeam.name, allOddsEvents);
      const enriched: EnrichedMatch = {
        ...m,
        odds: oddsEvent ? (oddsMap.get(oddsEvent.id) ?? null) : null,
        homeLineup: null, awayLineup: null,
        homeTopPlayers: [], awayTopPlayers: [],
        homeSeasonStats: null, awaySeasonStats: null,
        valuePicks: [],
        lastEnriched: new Date().toISOString(),
      };
      matchMap.set(key, enriched);
    }
  }

  // 3. Add remaining Odds API events as matches (covers leagues not in other sources)
  const todayStart = new Date(today + "T00:00:00Z").getTime() / 1000;
  const todayEnd = todayStart + 86400;

  for (const ev of allOddsEvents) {
    const key = normalizeKey(ev.home_team, ev.away_team);
    if (matchMap.has(key)) continue;

    const commenceTs = new Date(ev.commence_time).getTime() / 1000;
    if (commenceTs < todayStart || commenceTs >= todayEnd) continue;

    const odds = oddsMap.get(ev.id) ?? null;
    const competitionName = SPORT_KEY_NAMES[ev.sport_key] ?? ev.sport_title;

    const match: EnrichedMatch = {
      id: `odds_${ev.id}`,
      oddsApiEventId: ev.id,
      competition: { id: 0, name: competitionName, code: ev.sport_key },
      homeTeam: { id: 0, name: ev.home_team },
      awayTeam: { id: 0, name: ev.away_team },
      utcDate: ev.commence_time,
      status: inferStatus(ev.commence_time),
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
      odds,
      homeLineup: null, awayLineup: null,
      homeTopPlayers: [], awayTopPlayers: [],
      homeSeasonStats: null, awaySeasonStats: null,
      valuePicks: [],
      lastEnriched: new Date().toISOString(),
    };

    matchMap.set(key, match);
  }

  const matches = Array.from(matchMap.values());

  // Sort: live → scheduled by time → finished
  matches.sort((a, b) => {
    const order = (s: string) => s === "IN_PLAY" || s === "PAUSED" ? 0 : s === "FINISHED" ? 2 : 1;
    const diff = order(a.status) - order(b.status);
    if (diff !== 0) return diff;
    return new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime();
  });

  logger.info(`Total enriched matches: ${matches.length}`);
  cache.set(cacheKey, matches, TTL.ENRICHED_MATCH);
  return matches;
}

// ── Detail: full enrichment for one game ──────────────────────────────────
export async function getEnrichedMatch(id: string): Promise<EnrichedMatch | null> {
  const cacheKey = `enriched:detail:${id}`;
  const cached = cache.get<EnrichedMatch>(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  const list = await getEnrichedTodayMatches(today);
  const base = list.find((m) => m.id === id);
  if (!base) return null;

  // Only enrich if we have a Sofascore ID
  if (!base.sofascoreId) return base;

  logger.info(`Enriching match detail for ${id}`);

  const ev_id = base.sofascoreId;
  const tid = base.competition.id;

  const [lineups, homeStats, awayStats, homePlayers, awayPlayers] = await Promise.all([
    getLineups(ev_id),
    tid ? getTeamSeasonStats(base.homeTeam.id, tid, 0) : Promise.resolve(null),
    tid ? getTeamSeasonStats(base.awayTeam.id, tid, 0) : Promise.resolve(null),
    tid ? getTeamTopPlayers(base.homeTeam.id, tid, 0) : Promise.resolve([]),
    tid ? getTeamTopPlayers(base.awayTeam.id, tid, 0) : Promise.resolve([]),
  ]);

  const enriched: EnrichedMatch = {
    ...base,
    homeLineup: lineups?.home ?? null,
    awayLineup: lineups?.away ?? null,
    homeSeasonStats: homeStats ? { ...homeStats, teamName: base.homeTeam.name } : null,
    awaySeasonStats: awayStats ? { ...awayStats, teamName: base.awayTeam.name } : null,
    homeTopPlayers: homePlayers,
    awayTopPlayers: awayPlayers,
    lastEnriched: new Date().toISOString(),
  };
  enriched.valuePicks = findValuePicks(enriched);

  cache.set(cacheKey, enriched, TTL.ENRICHED_MATCH);
  return enriched;
}

// ── Helpers ────────────────────────────────────────────────────────────────
function buildFromSofascore(
  ev: SofascoreEvent,
  allOddsEvents: RawEvent[],
  oddsMap: ReturnType<typeof normalizeOdds>
): EnrichedMatch {
  const oddsEvent = findOddsEvent(ev.homeTeam.name, ev.awayTeam.name, allOddsEvents);
  return {
    id: `ss_${ev.id}`,
    sofascoreId: ev.id,
    oddsApiEventId: oddsEvent?.id,
    competition: {
      id: ev.tournament.uniqueTournament?.id ?? ev.tournament.id,
      name: ev.tournament.name,
      code: ev.tournament.category?.country?.name ?? "",
      country: ev.tournament.category?.country?.name,
    },
    homeTeam: { id: ev.homeTeam.id, name: ev.homeTeam.name },
    awayTeam: { id: ev.awayTeam.id, name: ev.awayTeam.name },
    utcDate: new Date(ev.startTimestamp * 1000).toISOString(),
    status: normalizeStatus(ev.status?.type),
    score: {
      fullTime: { home: ev.homeScore?.current ?? null, away: ev.awayScore?.current ?? null },
      halfTime: { home: null, away: null },
    },
    venue: ev.venue?.stadium?.name ?? ev.venue?.city?.name,
    odds: oddsEvent ? (oddsMap.get(oddsEvent.id) ?? null) : null,
    homeLineup: null, awayLineup: null,
    homeTopPlayers: [], awayTopPlayers: [],
    homeSeasonStats: null, awaySeasonStats: null,
    valuePicks: [],
    lastEnriched: new Date().toISOString(),
  };
}

function normalizeKey(home: string, away: string): string {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6);
  return `${n(home)}_${n(away)}`;
}

function normalizeStatus(type?: string): Match["status"] {
  switch (type) {
    case "inprogress": return "IN_PLAY";
    case "finished":   return "FINISHED";
    case "notstarted": return "SCHEDULED";
    case "postponed":  return "POSTPONED";
    case "canceled":   return "CANCELLED";
    case "halftime":   return "PAUSED";
    default:           return "SCHEDULED";
  }
}

function inferStatus(commenceTime: string): Match["status"] {
  const now = Date.now();
  const start = new Date(commenceTime).getTime();
  const diff = now - start;
  if (diff < 0) return "SCHEDULED";
  if (diff < 115 * 60 * 1000) return "IN_PLAY"; // within ~2h of start
  return "FINISHED";
}
