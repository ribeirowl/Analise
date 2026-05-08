import { cache, TTL } from "../cache";
import { logger } from "../logger";
import { getScheduledEvents, SofascoreEvent } from "../services/sofascore";
import { getTodayMatches } from "../services/footballData";
import { getFixturesByDate, getTeamStats, getSquadTopStats, normalizeAFStatus, AFFixture, LEAGUE_IDS, CURRENT_SEASON } from "../services/apiFootball";
import { getAllFootballOdds, normalizeOdds, findOddsEvent, RawEvent } from "../services/theOddsApi";
import { espn } from "../services/espn";
import { openLigaDB } from "../services/openLigaDB";
import { clubElo } from "../services/clubElo";
import { understat } from "../services/understat";
import { findValuePicks, buildPoissonInput } from "./valueFinder";
import type { EnrichedMatch, Match, Competition, Team, TeamSeasonStats, PlayerStats } from "@analise-futebol/shared";

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

// Map AF league name → Understat league key
const AF_TO_UNDERSTAT: Record<string, string> = {
  "Premier League": "EPL",
  "La Liga": "LaLiga",
  "Serie A": "SerieA",
  "Bundesliga": "Bundesliga",
  "Ligue 1": "Ligue1",
};

// ── List ──────────────────────────────────────────────────────────────────
export async function getEnrichedTodayMatches(date?: string): Promise<EnrichedMatch[]> {
  const today = date ?? new Date().toISOString().slice(0, 10);
  const cacheKey = `enriched:list:${today}`;
  const cached = cache.get<EnrichedMatch[]>(cacheKey);
  if (cached) return cached;

  logger.info(`Fetching match list for ${today}`);

  const [ssEvents, afFixtures, fdMatches, allOddsEvents, espnEvents] = await Promise.all([
    getScheduledEvents(today),
    getFixturesByDate(today),
    getTodayMatches(today),
    getAllFootballOdds(),
    espn.getAllScoreboards(),
  ]);

  logger.info(`SS:${ssEvents.length} AF:${afFixtures.length} FD:${fdMatches.length} Odds:${allOddsEvents.length} ESPN:${espnEvents.length}`);

  const oddsMap = normalizeOdds(allOddsEvents);
  const matchMap = new Map<string, EnrichedMatch>();

  // 1. API-Football (primary when key available)
  for (const fix of afFixtures) {
    const m = buildFromAFFixture(fix, allOddsEvents, oddsMap);
    matchMap.set(normalizeKey(m.homeTeam.name, m.awayTeam.name), m);
  }

  // 2. Sofascore (more competitions than AF free tier)
  for (const ev of ssEvents) {
    const key = normalizeKey(ev.homeTeam.name, ev.awayTeam.name);
    if (!matchMap.has(key)) {
      matchMap.set(key, buildFromSofascore(ev, allOddsEvents, oddsMap));
    }
  }

  // 3. football-data.org
  for (const m of fdMatches) {
    const key = normalizeKey(m.homeTeam.name, m.awayTeam.name);
    if (!matchMap.has(key)) {
      const oddsEvent = findOddsEvent(m.homeTeam.name, m.awayTeam.name, allOddsEvents);
      matchMap.set(key, {
        ...m,
        odds: oddsEvent ? (oddsMap.get(oddsEvent.id) ?? null) : null,
        homeLineup: null, awayLineup: null,
        homeTopPlayers: [], awayTopPlayers: [],
        homeSeasonStats: null, awaySeasonStats: null,
        valuePicks: [], lastEnriched: new Date().toISOString(),
      } as EnrichedMatch);
    }
  }

  // 4. ESPN (backup for other competitions)
  for (const ev of espnEvents) {
    const comp = ev.competitions[0];
    if (!comp) continue;
    const home = comp.competitors.find((c) => c.homeAway === "home");
    const away = comp.competitors.find((c) => c.homeAway === "away");
    if (!home || !away) continue;
    const key = normalizeKey(home.team.name, away.team.name);
    if (!matchMap.has(key)) {
      const oddsEvent = findOddsEvent(home.team.name, away.team.name, allOddsEvents);
      matchMap.set(key, {
        id: `espn_${ev.id}`,
        competition: { id: 0, name: "ESPN", code: "" },
        homeTeam: { id: Number(home.team.id), name: home.team.name, crest: home.team.logo },
        awayTeam: { id: Number(away.team.id), name: away.team.name, crest: away.team.logo },
        utcDate: ev.date,
        status: ev.status.type.completed ? "FINISHED" : "SCHEDULED",
        score: {
          fullTime: { home: Number(home.score) || null, away: Number(away.score) || null },
          halfTime: { home: null, away: null },
        },
        odds: oddsEvent ? (oddsMap.get(oddsEvent.id) ?? null) : null,
        homeLineup: null, awayLineup: null,
        homeTopPlayers: [], awayTopPlayers: [],
        homeSeasonStats: null, awaySeasonStats: null,
        valuePicks: [], lastEnriched: new Date().toISOString(),
      } as EnrichedMatch);
    }
  }

  // 5. Remaining Odds API events (fill gaps)
  const todayStart = new Date(today + "T00:00:00Z").getTime() / 1000;
  const todayEnd = todayStart + 86400;
  for (const ev of allOddsEvents) {
    const key = normalizeKey(ev.home_team, ev.away_team);
    if (matchMap.has(key)) continue;
    const ts = new Date(ev.commence_time).getTime() / 1000;
    if (ts < todayStart || ts >= todayEnd) continue;
    const odds = oddsMap.get(ev.id) ?? null;
    matchMap.set(key, {
      id: `odds_${ev.id}`,
      oddsApiEventId: ev.id,
      competition: { id: 0, name: SPORT_KEY_NAMES[ev.sport_key] ?? ev.sport_title, code: ev.sport_key },
      homeTeam: { id: 0, name: ev.home_team },
      awayTeam: { id: 0, name: ev.away_team },
      utcDate: ev.commence_time,
      status: inferStatus(ev.commence_time),
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
      odds,
      homeLineup: null, awayLineup: null,
      homeTopPlayers: [], awayTopPlayers: [],
      homeSeasonStats: null, awaySeasonStats: null,
      valuePicks: [], lastEnriched: new Date().toISOString(),
    } as EnrichedMatch);
  }

  const matches = Array.from(matchMap.values());
  matches.sort((a, b) => {
    const order = (s: string) => (s === "IN_PLAY" || s === "PAUSED" ? 0 : s === "FINISHED" ? 2 : 1);
    const diff = order(a.status) - order(b.status);
    return diff !== 0 ? diff : new Date(a.utcDate).getTime() - new Date(b.utcDate).getTime();
  });

  logger.info(`Total matches: ${matches.length}`);
  cache.set(cacheKey, matches, TTL.ENRICHED_MATCH);
  return matches;
}

// ── Detail ────────────────────────────────────────────────────────────────
export async function getEnrichedMatch(id: string): Promise<EnrichedMatch | null> {
  const cacheKey = `enriched:detail:${id}`;
  const cached = cache.get<EnrichedMatch>(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  const list = await getEnrichedTodayMatches(today);
  const base = list.find((m) => m.id === id);
  if (!base) return null;

  logger.info(`Enriching detail for ${id}`);

  // Determine enrichment source
  if (base.id.startsWith("af_")) {
    return enrichFromApiFootball(base, cacheKey);
  } else if (base.sofascoreId) {
    return enrichFromSofascore(base, cacheKey);
  }

  // No stats source — still compute value picks with Elo
  const eloDiff = await clubElo.getEloDiff(base.homeTeam.name, base.awayTeam.name);
  const input = buildPoissonInput(null, null, eloDiff);
  const enriched = { ...base, valuePicks: findValuePicks({ ...base, homeSeasonStats: null, awaySeasonStats: null }, input) };
  cache.set(cacheKey, enriched, TTL.ENRICHED_MATCH);
  return enriched;
}

async function enrichFromApiFootball(base: EnrichedMatch, cacheKey: string): Promise<EnrichedMatch> {
  const fixtureId = Number(base.id.replace("af_", ""));
  const leagueId = base.competition.id;
  const leagueKey = Object.keys(AF_TO_UNDERSTAT).find((k) => k === base.competition.name) ?? "";
  const usKey = AF_TO_UNDERSTAT[leagueKey];

  const [homeStatsRaw, awayStatsRaw, homePlayers, awayPlayers, eloDiff, usData] = await Promise.all([
    getTeamStats(base.homeTeam.id, leagueId),
    getTeamStats(base.awayTeam.id, leagueId),
    getSquadTopStats(base.homeTeam.id, leagueId),
    getSquadTopStats(base.awayTeam.id, leagueId),
    clubElo.getEloDiff(base.homeTeam.name, base.awayTeam.name),
    usKey ? understat.getLeagueXG(usKey) : Promise.resolve(null),
  ]);

  const homeSeasonStats = homeStatsRaw ? normalizeAFStats(homeStatsRaw, base.homeTeam.name) : null;
  const awaySeasonStats = awayStatsRaw ? normalizeAFStats(awayStatsRaw, base.awayTeam.name) : null;

  const homeXG = usData ? understat.findTeamXG(usData, base.homeTeam.name)?.xG : undefined;
  const awayXG = usData ? understat.findTeamXG(usData, base.awayTeam.name)?.xG : undefined;

  const input = buildPoissonInput(homeSeasonStats, awaySeasonStats, eloDiff, homeXG, awayXG);

  const enriched: EnrichedMatch = {
    ...base,
    homeSeasonStats,
    awaySeasonStats,
    homeTopPlayers: normalizeAFPlayers(homePlayers),
    awayTopPlayers: normalizeAFPlayers(awayPlayers),
    lastEnriched: new Date().toISOString(),
  };
  enriched.valuePicks = findValuePicks(enriched, input);

  cache.set(cacheKey, enriched, TTL.ENRICHED_MATCH);
  return enriched;
}

async function enrichFromSofascore(base: EnrichedMatch, cacheKey: string): Promise<EnrichedMatch> {
  const { getLineups, getTeamTopPlayers, getTeamSeasonStats } = await import("../services/sofascore");
  const ev_id = base.sofascoreId!;
  const tid = base.competition.id;

  const [lineups, homeStats, awayStats, homePlayers, awayPlayers, eloDiff] = await Promise.all([
    getLineups(ev_id),
    tid ? getTeamSeasonStats(base.homeTeam.id, tid, 0) : Promise.resolve(null),
    tid ? getTeamSeasonStats(base.awayTeam.id, tid, 0) : Promise.resolve(null),
    tid ? getTeamTopPlayers(base.homeTeam.id, tid, 0) : Promise.resolve([]),
    tid ? getTeamTopPlayers(base.awayTeam.id, tid, 0) : Promise.resolve([]),
    clubElo.getEloDiff(base.homeTeam.name, base.awayTeam.name),
  ]);

  const homeSeasonStats = homeStats ? { ...homeStats, teamName: base.homeTeam.name } : null;
  const awaySeasonStats = awayStats ? { ...awayStats, teamName: base.awayTeam.name } : null;
  const input = buildPoissonInput(homeSeasonStats, awaySeasonStats, eloDiff);

  const enriched: EnrichedMatch = {
    ...base,
    homeLineup: lineups?.home ?? null,
    awayLineup: lineups?.away ?? null,
    homeSeasonStats,
    awaySeasonStats,
    homeTopPlayers: homePlayers,
    awayTopPlayers: awayPlayers,
    lastEnriched: new Date().toISOString(),
  };
  enriched.valuePicks = findValuePicks(enriched, input);

  cache.set(cacheKey, enriched, TTL.ENRICHED_MATCH);
  return enriched;
}

// ── H2H ───────────────────────────────────────────────────────────────────
export async function getH2HSummary(homeId: number, awayId: number) {
  const { getH2H } = await import("../services/apiFootball");
  const fixtures = await getH2H(homeId, awayId);
  if (!fixtures.length) return null;

  const homeWins = fixtures.filter((f) => f.teams.home.id === homeId && f.teams.home.winner).length +
    fixtures.filter((f) => f.teams.away.id === homeId && f.teams.away.winner).length;
  const awayWins = fixtures.filter((f) => f.teams.home.id === awayId && f.teams.home.winner).length +
    fixtures.filter((f) => f.teams.away.id === awayId && f.teams.away.winner).length;
  const draws = fixtures.length - homeWins - awayWins;
  const over25 = fixtures.filter((f) => {
    const total = (f.goals.home ?? 0) + (f.goals.away ?? 0);
    return total > 2.5;
  }).length;
  const btts = fixtures.filter((f) => (f.goals.home ?? 0) > 0 && (f.goals.away ?? 0) > 0).length;

  return {
    total: fixtures.length,
    homeWins, awayWins, draws,
    over25Pct: over25 / fixtures.length,
    bttsPct: btts / fixtures.length,
    recentFixtures: fixtures.slice(0, 5).map((f) => ({
      date: f.fixture.date,
      homeTeam: f.teams.home.name,
      awayTeam: f.teams.away.name,
      homeGoals: f.goals.home,
      awayGoals: f.goals.away,
      status: f.fixture.status.short,
    })),
  };
}

// ── Builders ──────────────────────────────────────────────────────────────
function buildFromAFFixture(
  fix: AFFixture,
  allOddsEvents: RawEvent[],
  oddsMap: ReturnType<typeof normalizeOdds>
): EnrichedMatch {
  const oddsEvent = findOddsEvent(fix.teams.home.name, fix.teams.away.name, allOddsEvents);
  return {
    id: `af_${fix.fixture.id}`,
    competition: { id: fix.league.id, name: fix.league.name, code: "", country: fix.league.country },
    homeTeam: { id: fix.teams.home.id, name: fix.teams.home.name, crest: fix.teams.home.logo },
    awayTeam: { id: fix.teams.away.id, name: fix.teams.away.name, crest: fix.teams.away.logo },
    utcDate: fix.fixture.date,
    status: normalizeAFStatus(fix.fixture.status.short) as Match["status"],
    score: {
      fullTime: { home: fix.score.fulltime.home, away: fix.score.fulltime.away },
      halfTime: { home: fix.score.halftime.home, away: fix.score.halftime.away },
    },
    venue: fix.fixture.venue.name ?? undefined,
    referee: fix.fixture.referee ?? undefined,
    odds: oddsEvent ? (oddsMap.get(oddsEvent.id) ?? null) : null,
    homeLineup: null, awayLineup: null,
    homeTopPlayers: [], awayTopPlayers: [],
    homeSeasonStats: null, awaySeasonStats: null,
    valuePicks: [], lastEnriched: new Date().toISOString(),
  };
}

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
    status: normalizeSSStatus(ev.status?.type),
    score: {
      fullTime: { home: ev.homeScore?.current ?? null, away: ev.awayScore?.current ?? null },
      halfTime: { home: null, away: null },
    },
    venue: ev.venue?.stadium?.name ?? ev.venue?.city?.name,
    odds: oddsEvent ? (oddsMap.get(oddsEvent.id) ?? null) : null,
    homeLineup: null, awayLineup: null,
    homeTopPlayers: [], awayTopPlayers: [],
    homeSeasonStats: null, awaySeasonStats: null,
    valuePicks: [], lastEnriched: new Date().toISOString(),
  };
}

function normalizeAFStats(s: import("../services/apiFootball").AFTeamStats, teamName: string): TeamSeasonStats {
  const gp = s.fixtures.played.total;
  return {
    teamId: s.team.id,
    teamName,
    competitionId: s.league.id,
    goalsScored: Math.round(parseFloat(s.goals.for.average.total) * gp),
    goalsConceded: Math.round(parseFloat(s.goals.against.average.total) * gp),
    avgShotsFor: undefined,
    wins: s.fixtures.wins.total,
    draws: s.fixtures.draws.total,
    losses: s.fixtures.loses.total,
    gamesPlayed: gp,
  };
}

function normalizeAFPlayers(players: import("../services/apiFootball").AFPlayer[]): PlayerStats[] {
  return players.slice(0, 15).map((p) => {
    const s = p.statistics[0];
    return {
      playerId: p.player.id,
      name: p.player.name,
      rating: s?.games.rating ? parseFloat(s.games.rating) : undefined,
      goals: s?.goals.total ?? undefined,
      assists: s?.goals.assists ?? undefined,
      totalShots: s?.shots.total ?? undefined,
      shotsOnTarget: s?.shots.on ?? undefined,
      tackles: s?.tackles.total ?? undefined,
      interceptions: s?.tackles.interceptions ?? undefined,
      keyPasses: s?.passes.key ?? undefined,
      successfulDribbles: s?.dribbles.success ?? undefined,
      yellowCards: s?.cards.yellow ?? undefined,
      redCards: s?.cards.red ?? undefined,
      gamesPlayed: s?.games.appearences ?? undefined,
    };
  });
}

function normalizeSSStatus(type?: string): Match["status"] {
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

function normalizeKey(home: string, away: string): string {
  const n = (s: string) => s.toLowerCase().replace(/[^a-z]/g, "").slice(0, 6);
  return `${n(home)}_${n(away)}`;
}

function inferStatus(commenceTime: string): Match["status"] {
  const diff = Date.now() - new Date(commenceTime).getTime();
  if (diff < 0) return "SCHEDULED";
  if (diff < 115 * 60 * 1000) return "IN_PLAY";
  return "FINISHED";
}
