/**
 * Reads bzzoiro match data from Supabase.
 * Data is populated externally (Claude MCP session syncs predictions + odds
 * to the bzzoiro_match_data table; this module just reads it).
 */
import { supabase } from "./supabase";
import { logger } from "../logger";
import { cache, TTL } from "../cache";
import type { MatchOdds, BookmakerOdds } from "@analise-futebol/shared";

export interface BzzoiroMatchData {
  event_id: number;
  event_date: string;
  league_id: number;
  league_name: string;
  home_team: string;
  away_team: string;
  status: string;
  prob_home: number | null;
  prob_draw: number | null;
  prob_away: number | null;
  prob_over_25: number | null;
  prob_btts: number | null;
  xg_home: number | null;
  xg_away: number | null;
  odd_home: number | null;
  odd_draw: number | null;
  odd_away: number | null;
  bk_home: string | null;
  bk_draw: string | null;
  bk_away: string | null;
  odd_over25: number | null;
  odd_under25: number | null;
  bk_over25: string | null;
  bk_under25: string | null;
  odd_btts_yes: number | null;
  odd_btts_no: number | null;
  bk_btts_yes: string | null;
  bk_btts_no: string | null;
  synced_at: string;
}

/** Fetch all bzzoiro matches from the next N days. */
export async function getBzzoiroMatches(daysAhead = 7): Promise<BzzoiroMatchData[]> {
  const cacheKey = `bzzoiro:matches:${daysAhead}`;
  const cached = cache.get<BzzoiroMatchData[]>(cacheKey);
  if (cached) return cached;

  if (!supabase) return [];
  try {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + daysAhead * 86400_000).toISOString();
    const { data, error } = await supabase
      .from("bzzoiro_match_data")
      .select("*")
      .gte("event_date", from)
      .lte("event_date", to)
      .order("event_date");

    if (error) { logger.warn("bzzoiro read failed", error.message); return []; }
    const result = (data ?? []) as BzzoiroMatchData[];
    cache.set(cacheKey, result, TTL.ENRICHED_MATCH);
    return result;
  } catch (err) {
    logger.warn("bzzoiro fetch error", String(err));
    return [];
  }
}

/** Find a bzzoiro record by team names (fuzzy). */
export function findBzzoiroMatch(
  homeTeam: string,
  awayTeam: string,
  matches: BzzoiroMatchData[]
): BzzoiroMatchData | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const h = norm(homeTeam);
  const a = norm(awayTeam);
  for (const m of matches) {
    const mh = norm(m.home_team);
    const ma = norm(m.away_team);
    if (
      (mh.includes(h.slice(0, 5)) || h.includes(mh.slice(0, 5))) &&
      (ma.includes(a.slice(0, 5)) || a.includes(ma.slice(0, 5)))
    ) {
      return m;
    }
  }
  return null;
}

/** Convert bzzoiro record to shared MatchOdds format. */
export function bzzoiroToMatchOdds(bz: BzzoiroMatchData): MatchOdds | null {
  if (!bz.odd_home && !bz.odd_draw && !bz.odd_away) return null;

  const bm: BookmakerOdds = {
    bookmaker: [bz.bk_home, bz.bk_draw, bz.bk_away].filter(Boolean).join("/") || "bzzoiro",
    lastUpdate: bz.synced_at,
    home: bz.odd_home,
    draw: bz.odd_draw,
    away: bz.odd_away,
    over25: bz.odd_over25,
    under25: bz.odd_under25,
    btts_yes: bz.odd_btts_yes,
    btts_no: bz.odd_btts_no,
  };

  return {
    matchId: `bzz_${bz.event_id}`,
    bookmakers: [bm],
    playerProps: [],
    lastUpdated: bz.synced_at,
  };
}

/** Convert bzzoiro CatBoost probabilities to Poisson-compatible input. */
export function bzzoiroProbToPoisson(bz: BzzoiroMatchData) {
  return {
    // Convert percentage to 0-1 probability
    homeWinProb:  (bz.prob_home  ?? 33) / 100,
    drawProb:     (bz.prob_draw  ?? 33) / 100,
    awayWinProb:  (bz.prob_away  ?? 33) / 100,
    probOver25:   (bz.prob_over_25 ?? 50) / 100,
    probBTTS:     (bz.prob_btts  ?? 50) / 100,
    xgHome:       bz.xg_home ?? null,
    xgAway:       bz.xg_away ?? null,
  };
}
