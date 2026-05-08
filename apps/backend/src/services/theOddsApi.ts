import { config } from "../config";
import { cache, TTL } from "../cache";
import { logger } from "../logger";
import type { MatchOdds, BookmakerOdds, PlayerPropOdds } from "@analise-futebol/shared";

const BASE_URL = "https://api.the-odds-api.com/v4";

// Track quota usage in memory
let requestsRemaining: number | null = null;
let requestsUsed: number | null = null;

export function getOddsApiQuota() {
  return { requestsRemaining, requestsUsed };
}

async function fetchOdds<T>(path: string, ttlMs: number): Promise<T> {
  const cacheKey = `odds:${path}`;
  const cached = cache.get<T>(cacheKey);
  if (cached) return cached;

  const sep = path.includes("?") ? "&" : "?";
  const url = `${BASE_URL}${path}${sep}apiKey=${config.ODDS_API_KEY}`;

  let attempt = 0;
  while (attempt < 3) {
    try {
      const res = await fetch(url);

      // Update quota tracking
      const remaining = res.headers.get("x-requests-remaining");
      const used = res.headers.get("x-requests-used");
      if (remaining) requestsRemaining = Number(remaining);
      if (used) requestsUsed = Number(used);

      if (requestsRemaining !== null && requestsRemaining < 20) {
        logger.warn(`⚠️  The Odds API quota low: ${requestsRemaining} requests remaining`);
      }

      if (res.status === 429) {
        await sleep(10000 * (attempt + 1));
        attempt++;
        continue;
      }

      if (!res.ok) {
        throw new Error(`The Odds API ${res.status} ${res.statusText} — ${path}`);
      }

      const data = (await res.json()) as T;
      cache.set(cacheKey, data, ttlMs);
      return data;
    } catch (err) {
      attempt++;
      if (attempt >= 3) throw err;
      await sleep(2 ** attempt * 2000);
    }
  }
  throw new Error("The Odds API: max retries exceeded");
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

// ─── Raw types ─────────────────────────────────────────────────────────────
interface RawOutcome {
  name: string;
  price: number;
  point?: number;
}

interface RawMarket {
  key: string;
  last_update: string;
  outcomes: RawOutcome[];
}

interface RawBookmaker {
  key: string;
  title: string;
  last_update: string;
  markets: RawMarket[];
}

interface RawEvent {
  id: string;
  sport_key: string;
  sport_title: string;
  commence_time: string;
  home_team: string;
  away_team: string;
  bookmakers: RawBookmaker[];
}

// ─── Public API ────────────────────────────────────────────────────────────
// Football sport keys available in The Odds API
export const FOOTBALL_SPORT_KEYS = [
  "soccer_brazil_campeonato",
  "soccer_epl",
  "soccer_spain_la_liga",
  "soccer_italy_serie_a",
  "soccer_germany_bundesliga",
  "soccer_france_ligue_one",
  "soccer_uefa_champs_league",
  "soccer_uefa_europa_league",
  "soccer_conmebol_libertadores",
  "soccer_conmebol_sudamericana",
];

export async function getOddsForSport(sportKey: string): Promise<RawEvent[]> {
  const markets = "h2h,totals";
  const regions = config.ODDS_API_REGIONS;
  const path = `/sports/${sportKey}/odds?regions=${regions}&markets=${markets}&oddsFormat=decimal`;
  try {
    return await fetchOdds<RawEvent[]>(path, TTL.ODDS_API);
  } catch (err) {
    logger.warn("TheOddsApi getOddsForSport failed", { sportKey, err: String(err) });
    return [];
  }
}

export async function getAllFootballOdds(): Promise<RawEvent[]> {
  const results: RawEvent[] = [];
  // Fetch all sport keys in parallel but rate limit a bit
  await Promise.allSettled(
    FOOTBALL_SPORT_KEYS.map((key) =>
      getOddsForSport(key).then((events) => results.push(...events))
    )
  );
  return results;
}

export function normalizeOdds(events: RawEvent[]): Map<string, MatchOdds> {
  const map = new Map<string, MatchOdds>();

  for (const event of events) {
    const bookmakers: BookmakerOdds[] = event.bookmakers.map((bm) => {
      const h2h = bm.markets.find((m) => m.key === "h2h");
      const totals = bm.markets.find((m) => m.key === "totals");
      const bttsMkt = bm.markets.find((m) => m.key === "btts");

      const homeOdd = h2h?.outcomes.find((o) => o.name === event.home_team)?.price ?? null;
      const awayOdd = h2h?.outcomes.find((o) => o.name === event.away_team)?.price ?? null;
      const drawOdd = h2h?.outcomes.find((o) => o.name === "Draw")?.price ?? null;

      const over25 = totals?.outcomes.find((o) => o.name === "Over" && o.point === 2.5)?.price ?? null;
      const under25 = totals?.outcomes.find((o) => o.name === "Under" && o.point === 2.5)?.price ?? null;

      const btts_yes = bttsMkt?.outcomes.find((o) => o.name === "Yes")?.price ?? null;
      const btts_no = bttsMkt?.outcomes.find((o) => o.name === "No")?.price ?? null;

      return {
        bookmaker: bm.title,
        lastUpdate: bm.last_update,
        home: homeOdd,
        draw: drawOdd,
        away: awayOdd,
        over25,
        under25,
        btts_yes,
        btts_no,
      };
    });

    map.set(event.id, {
      matchId: event.id,
      bookmakers: bookmakers.filter(
        (b) => b.home !== null || b.draw !== null || b.away !== null
      ),
      playerProps: [],
      lastUpdated: new Date().toISOString(),
    });
  }

  return map;
}

// Search for matching event by team names (fuzzy)
export function findOddsEvent(
  homeTeam: string,
  awayTeam: string,
  events: RawEvent[]
): RawEvent | null {
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const homeN = normalize(homeTeam);
  const awayN = normalize(awayTeam);

  for (const event of events) {
    const evHome = normalize(event.home_team);
    const evAway = normalize(event.away_team);
    if (
      (evHome.includes(homeN.slice(0, 5)) || homeN.includes(evHome.slice(0, 5))) &&
      (evAway.includes(awayN.slice(0, 5)) || awayN.includes(evAway.slice(0, 5)))
    ) {
      return event;
    }
  }
  return null;
}
