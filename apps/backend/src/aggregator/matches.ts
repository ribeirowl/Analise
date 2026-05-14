import { cache, TTL } from "../cache";
import { logger } from "../logger";
import { getTodayMatches } from "../services/footballData";
import {
  getFixturesByDate, getTeamStats, getSquadTopStats, normalizeAFStatus,
  AFFixture, ALLOWED_LEAGUE_IDS,
} from "../services/apiFootball";
import { getAllFootballOdds, normalizeOdds, findOddsEvent, RawEvent } from "../services/theOddsApi";
import { espn } from "../services/espn";
import { clubElo } from "../services/clubElo";
import { understat } from "../services/understat";
import { findValuePicks, findValuePicksFromBzzoiro, buildPoissonInput } from "./valueFinder";
import { getBzzoiroMatches, findBzzoiroMatch, bzzoiroToMatchOdds } from "../services/bzzoiro";
import { upsertMatch, saveValuePicks, saveOddsSnapshot, updatePickResult } from "../services/supabase";
import type { EnrichedMatch, Match, TeamSeasonStats, PlayerStats } from "@analise-futebol/shared";

// Main leagues only — no random second divisions (except English Championship), no random countries
const ALLOWED_SPORT_KEYS = new Set([
  "soccer_epl",
  "soccer_england_efl_champ",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
  "soccer_france_ligue_one",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  "soccer_conmebol_copa_libertadores",
  "soccer_conmebol_copa_sudamericana",
  "soccer_brazil_campeonato",
]);

const SPORT_KEY_NAMES: Record<string, string> = {
  soccer_epl: "Premier League",
  soccer_england_efl_champ: "Championship",
  soccer_spain_la_liga: "La Liga",
  soccer_italy_serie_a: "Serie A",
  soccer_germany_bundesliga: "Bundesliga",
  soccer_france_ligue_one: "Ligue 1",
  soccer_uefa_champs_league: "UEFA Champions League",
  soccer_uefa_europa_league: "UEFA Europa League",
  soccer_conmebol_copa_libertadores: "Copa Libertadores",
  soccer_conmebol_copa_sudamericana: "Copa Sudamericana",
  soccer_brazil_campeonato: "Brasileirão Série A",
};

// Map competition name → Understat key
const NAME_TO_UNDERSTAT: Record<string, string> = {
  "Premier League": "EPL",
  "La Liga": "LaLiga",
  "Serie A": "SerieA",
  "Bundesliga": "Bundesliga",
  "Ligue 1": "Ligue1",
};

// ── List ──────────────────────────────────────────────────────────────────────
export async function getEnrichedTodayMatches(date?: string): Promise<EnrichedMatch[]> {
  const today = date ?? new Date().toISOString().slice(0, 10);
  const cacheKey = `enriched:list:${today}`;
  const cached = cache.get<EnrichedMatch[]>(cacheKey);
  if (cached) return cached;

  logger.info(`Fetching match list for ${today}`);

  // Primary sources in parallel
  const [afFixtures, allOddsEvents, bzzoiroMatches] = await Promise.all([
    getFixturesByDate(today),
    getAllFootballOdds(),
    getBzzoiroMatches(7),
  ]);

  // Secondary sources after primary (lower priority, less critical)
  const [fdMatches, espnEvents] = await Promise.all([
    getTodayMatches(today),
    espn.getAllScoreboards(),
  ]);

  logger.info(`AF:${afFixtures.length} Odds:${allOddsEvents.length} FD:${fdMatches.length} ESPN:${espnEvents.length}`);

  const oddsMap = normalizeOdds(allOddsEvents);
  const matchMap = new Map<string, EnrichedMatch>();

  // 1. API-Football — filtered to allowed leagues only
  for (const fix of afFixtures) {
    if (!ALLOWED_LEAGUE_IDS.has(fix.league.id)) continue;
    const m = buildFromAFFixture(fix, allOddsEvents, oddsMap);
    matchMap.set(normalizeKey(m.homeTeam.name, m.awayTeam.name), m);
  }

  // 2. football-data.org (covers top 12 competitions)
  for (const m of fdMatches) {
    const key = normalizeKey(m.homeTeam.name, m.awayTeam.name);
    if (matchMap.has(key)) continue;
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

  // 3. ESPN — only if competition name matches an allowed league
  const allowedCompNames = new Set(Object.values(SPORT_KEY_NAMES).map((n) => n.toLowerCase()));
  for (const ev of espnEvents) {
    const comp = ev.competitions?.[0];
    if (!comp) continue;
    const home = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "home") as
      | { team: { id: string; name: string; logo: string }; score: string } | undefined;
    const away = comp.competitors?.find((c: { homeAway: string }) => c.homeAway === "away") as
      | { team: { id: string; name: string; logo: string }; score: string } | undefined;
    if (!home || !away) continue;
    const key = normalizeKey(home.team.name, away.team.name);
    if (matchMap.has(key)) continue;
    const leagueName: string = ev.name ?? ((ev as unknown as Record<string, unknown>).league as string) ?? "";
    const isAllowed = Array.from(allowedCompNames).some((n) =>
      leagueName.toLowerCase().includes(n.split(" ")[0])
    );
    if (!isAllowed) continue;
    const oddsEvent = findOddsEvent(home.team.name, away.team.name, allOddsEvents);
    matchMap.set(key, {
      id: `espn_${ev.id}`,
      competition: { id: 0, name: leagueName, code: "" },
      homeTeam: { id: Number(home.team.id), name: home.team.name, crest: home.team.logo },
      awayTeam: { id: Number(away.team.id), name: away.team.name, crest: away.team.logo },
      utcDate: ev.date,
      status: (ev.status?.type?.completed ? "FINISHED" : "SCHEDULED") as Match["status"],
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

  // 4. Odds API events — only allowed sport keys, fills remaining gaps
  const todayStart = new Date(today + "T00:00:00Z").getTime() / 1000;
  const todayEnd = todayStart + 86400;
  for (const ev of allOddsEvents) {
    if (!ALLOWED_SPORT_KEYS.has(ev.sport_key)) continue;
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

  // 5. bzzoiro — fills any remaining gaps using Supabase-cached bzzoiro data
  for (const bz of bzzoiroMatches) {
    const key = normalizeKey(bz.home_team, bz.away_team);
    if (matchMap.has(key)) {
      // Match already exists — patch in bzzoiro odds if the existing entry has no odds
      const existing = matchMap.get(key)!;
      if (!existing.odds) {
        const bzOdds = bzzoiroToMatchOdds(bz);
        if (bzOdds) existing.odds = bzOdds;
      }
      continue;
    }
    const ts = new Date(bz.event_date).getTime() / 1000;
    if (ts < todayStart || ts >= todayEnd) continue;
    const bzOdds = bzzoiroToMatchOdds(bz);
    matchMap.set(key, {
      id: `bzz_${bz.event_id}`,
      competition: { id: bz.league_id, name: bz.league_name, code: "" },
      homeTeam: { id: 0, name: bz.home_team },
      awayTeam: { id: 0, name: bz.away_team },
      utcDate: bz.event_date,
      status: inferStatus(bz.event_date),
      score: { fullTime: { home: null, away: null }, halfTime: { home: null, away: null } },
      odds: bzOdds,
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

  logger.info(`Total matches (filtered to main leagues): ${matches.length}`);

  // Compute value picks — prefer bzzoiro CatBoost probabilities, fallback to Elo+Poisson
  const scheduledMatches = matches.filter((m) => m.odds && m.status !== "FINISHED");
  if (scheduledMatches.length > 0) {
    await Promise.allSettled(
      scheduledMatches.map(async (m) => {
        try {
          const bz = findBzzoiroMatch(m.homeTeam.name, m.awayTeam.name, bzzoiroMatches);
          if (bz && bz.prob_home !== null) {
            // CatBoost ML probabilities from bzzoiro — primary path
            m.valuePicks = findValuePicksFromBzzoiro(m, bz);
          } else {
            // Fallback: Elo-adjusted Poisson
            const eloDiff = await Promise.race([
              clubElo.getEloDiff(m.homeTeam.name, m.awayTeam.name),
              new Promise<number>((res) => setTimeout(() => res(0), 3000)),
            ]);
            const input = buildPoissonInput(m.homeSeasonStats, m.awaySeasonStats, eloDiff);
            m.valuePicks = findValuePicks(m, input);
          }
        } catch {
          m.valuePicks = findValuePicks(m, buildPoissonInput(m.homeSeasonStats, m.awaySeasonStats, 0));
        }
      })
    );
    const totalPicks = matches.reduce((n, m) => n + m.valuePicks.length, 0);
    logger.info(`Value picks computed: ${totalPicks} across ${scheduledMatches.length} matches`);
  }

  cache.set(cacheKey, matches, TTL.ENRICHED_MATCH);

  // Persist to Supabase sequentially in background (fire-and-forget, prevents overwhelming DB)
  setImmediate(() => persistToSupabase(matches));

  return matches;
}

async function persistToSupabase(matches: EnrichedMatch[]): Promise<void> {
  for (const m of matches) {
    try {
      await upsertMatch(m);
      if (m.odds) await saveOddsSnapshot(m);
      if (m.valuePicks.length > 0) await saveValuePicks(m.valuePicks, m.utcDate);
      if (m.status === "FINISHED" && m.score.fullTime.home !== null && m.score.fullTime.away !== null) {
        await updatePickResult(m.id, m.score.fullTime.home, m.score.fullTime.away);
      }
    } catch {
      // Non-critical persistence error — continue
    }
  }
}

// ── Detail ────────────────────────────────────────────────────────────────────
export async function getEnrichedMatch(id: string): Promise<EnrichedMatch | null> {
  const cacheKey = `enriched:detail:${id}`;
  const cached = cache.get<EnrichedMatch>(cacheKey);
  if (cached) return cached;

  const today = new Date().toISOString().slice(0, 10);
  const list = await getEnrichedTodayMatches(today);
  const base = list.find((m) => m.id === id);
  if (!base) return null;

  logger.info(`Enriching detail for ${id}`);

  if (base.id.startsWith("af_")) {
    return enrichFromApiFootball(base, cacheKey);
  }

  // For non-AF matches, try to find the AF fixture by date and match the teams
  const afFixtures = await getFixturesByDate(today);
  const afMatch = afFixtures.find((f) =>
    ALLOWED_LEAGUE_IDS.has(f.league.id) &&
    normalizeKey(f.teams.home.name, f.teams.away.name) === normalizeKey(base.homeTeam.name, base.awayTeam.name)
  );
  if (afMatch) {
    const afBase = buildFromAFFixture(afMatch, [], new Map());
    return enrichFromApiFootball({ ...base, ...afBase, id: base.id }, cacheKey);
  }

  // Fallback: Elo-only Poisson (no team stats available)
  const eloDiff = await clubElo.getEloDiff(base.homeTeam.name, base.awayTeam.name);
  const input = buildPoissonInput(null, null, eloDiff);
  const enriched = {
    ...base,
    valuePicks: findValuePicks({ ...base, homeSeasonStats: null, awaySeasonStats: null }, input),
  };
  cache.set(cacheKey, enriched, TTL.ENRICHED_MATCH);
  return enriched;
}

async function enrichFromApiFootball(base: EnrichedMatch, cacheKey: string): Promise<EnrichedMatch> {
  const leagueId = base.competition.id;
  const usKey = NAME_TO_UNDERSTAT[base.competition.name];

  // Stagger home/away stats to avoid bursting quota
  const homeStatsRaw = await getTeamStats(base.homeTeam.id, leagueId);
  const awayStatsRaw = await getTeamStats(base.awayTeam.id, leagueId);

  const [homePlayers, awayPlayers, eloDiff, usData] = await Promise.all([
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

// ── H2H ───────────────────────────────────────────────────────────────────────
export async function getH2HSummary(homeId: number, awayId: number) {
  const { getH2H } = await import("../services/apiFootball");
  const fixtures = await getH2H(homeId, awayId);
  if (!fixtures.length) return null;

  const homeWins =
    fixtures.filter((f) => f.teams.home.id === homeId && f.teams.home.winner).length +
    fixtures.filter((f) => f.teams.away.id === homeId && f.teams.away.winner).length;
  const awayWins =
    fixtures.filter((f) => f.teams.home.id === awayId && f.teams.home.winner).length +
    fixtures.filter((f) => f.teams.away.id === awayId && f.teams.away.winner).length;
  const draws = fixtures.length - homeWins - awayWins;
  const over25 = fixtures.filter((f) => (f.goals.home ?? 0) + (f.goals.away ?? 0) > 2.5).length;
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

// ── Builders ──────────────────────────────────────────────────────────────────
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

// ── Stats normalization ───────────────────────────────────────────────────────
function normalizeAFStats(s: import("../services/apiFootball").AFTeamStats, teamName: string): TeamSeasonStats {
  const sumMinutes = (obj: Record<string, { total: number | null }>, keys: string[]) =>
    keys.reduce((acc, k) => acc + (obj[k]?.total ?? 0), 0);

  const firstHalfGoalsFor = sumMinutes(s.goals.for.minute, ["0-15", "16-30", "31-45"]);
  const firstHalfGoalsAgainst = sumMinutes(s.goals.against.minute, ["0-15", "16-30", "31-45"]);
  const secondHalfGoalsFor = sumMinutes(s.goals.for.minute, ["46-60", "61-75", "76-90", "91-105"]);
  const secondHalfGoalsAgainst = sumMinutes(s.goals.against.minute, ["46-60", "61-75", "76-90", "91-105"]);

  return {
    teamId: s.team.id,
    teamName,
    competitionId: s.league.id,
    // Overall
    gamesPlayed: s.fixtures.played.total,
    wins: s.fixtures.wins.total,
    draws: s.fixtures.draws.total,
    losses: s.fixtures.loses.total,
    goalsScored: s.goals.for.total.total,
    goalsConceded: s.goals.against.total.total,
    avgGoalsFor: parseFloat(s.goals.for.average.total) || undefined,
    avgGoalsAgainst: parseFloat(s.goals.against.average.total) || undefined,
    // Home splits
    homeGamesPlayed: s.fixtures.played.home,
    homeWins: s.fixtures.wins.home,
    homeDraws: s.fixtures.draws.home,
    homeLosses: s.fixtures.loses.home,
    homeGoalsScored: s.goals.for.total.home,
    homeGoalsConceded: s.goals.against.total.home,
    homeAvgGoalsFor: parseFloat(s.goals.for.average.home) || undefined,
    homeAvgGoalsAgainst: parseFloat(s.goals.against.average.home) || undefined,
    // Away splits
    awayGamesPlayed: s.fixtures.played.away,
    awayWins: s.fixtures.wins.away,
    awayDraws: s.fixtures.draws.away,
    awayLosses: s.fixtures.loses.away,
    awayGoalsScored: s.goals.for.total.away,
    awayGoalsConceded: s.goals.against.total.away,
    awayAvgGoalsFor: parseFloat(s.goals.for.average.away) || undefined,
    awayAvgGoalsAgainst: parseFloat(s.goals.against.average.away) || undefined,
    // 1H / 2H goals
    firstHalfGoalsFor: firstHalfGoalsFor || undefined,
    firstHalfGoalsAgainst: firstHalfGoalsAgainst || undefined,
    secondHalfGoalsFor: secondHalfGoalsFor || undefined,
    secondHalfGoalsAgainst: secondHalfGoalsAgainst || undefined,
    // Clean sheets
    cleanSheets: s.clean_sheet.total,
    homeCleanSheets: s.clean_sheet.home,
    awayCleanSheets: s.clean_sheet.away,
    failedToScore: s.failed_to_score.total,
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

function normalizeKey(home: string, away: string): string {
  const n = (s: string) =>
    s.toLowerCase()
      .replace(/\b(real|fc|cf|ac|as|sc|rc|cd|ud|rcd|sd|ss|afc|bfc|vfb|vfl|rb|sv|fsv|1\.|borussia)\b/g, "")
      .replace(/[^a-z]/g, "")
      .slice(0, 8);
  return `${n(home)}_${n(away)}`;
}

function inferStatus(commenceTime: string): Match["status"] {
  const diff = Date.now() - new Date(commenceTime).getTime();
  if (diff < 0) return "SCHEDULED";
  if (diff < 115 * 60 * 1000) return "IN_PLAY";
  return "FINISHED";
}
