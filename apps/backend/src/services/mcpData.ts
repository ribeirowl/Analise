/**
 * Reads MCP-synced match data from Supabase.
 *
 * Data is populated by Claude MCP sessions (via the football MCP tools):
 *   mcp_predictions  — CatBoost ML probabilities + xG + over/under + BTTS
 *   mcp_odds         — Best decimal odds per bookmaker, per market, per event
 *   mcp_fixtures     — Live scores, status updates
 *   mcp_lineups      — Confirmed or AI-predicted starters
 *
 * The Node.js backend only reads — never writes — to these tables.
 */

import { supabase } from "./supabase";
import { logger } from "../logger";
import { cache, TTL } from "../cache";
import type { MatchOdds, BookmakerOdds } from "@analise-futebol/shared";

// ── Types ─────────────────────────────────────────────────────────────────────

export interface McpPrediction {
  id: number;
  event_id: number;
  event_date: string;
  league_id: number;
  league_name: string;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  prob_home: number | null;
  prob_draw: number | null;
  prob_away: number | null;
  predicted: string | null;
  xg_home: number | null;
  xg_away: number | null;
  prob_over_15: number | null;
  prob_over_25: number | null;
  prob_over_35: number | null;
  prob_btts_yes: number | null;
  most_likely_score: string | null;
  model_confidence: number | null;
  model_version: string | null;
  synced_at: string;
}

export interface McpOddsRow {
  event_id: number;
  market: string;
  outcome: string;
  decimal_odds: number;
  bookmaker_slug: string;
  bookmaker_name: string;
  updated_at: string | null;
}

export interface McpFixture {
  id: number;
  league_id: number;
  league_name: string;
  home_team_id: number;
  home_team: string;
  away_team_id: number;
  away_team: string;
  event_date: string;
  status: string;
  period: string | null;
  current_minute: number | null;
  home_score: number | null;
  away_score: number | null;
  home_score_ht: number | null;
  away_score_ht: number | null;
  synced_at: string;
}

// ── Predictions ───────────────────────────────────────────────────────────────

/** Fetch all upcoming MCP predictions (next N days). */
export async function getMcpPredictions(daysAhead = 7): Promise<McpPrediction[]> {
  const cacheKey = `mcp:predictions:${daysAhead}`;
  const cached = cache.get<McpPrediction[]>(cacheKey);
  if (cached) return cached;

  if (!supabase) return [];
  try {
    const from = new Date().toISOString();
    const to = new Date(Date.now() + daysAhead * 86_400_000).toISOString();
    const { data, error } = await supabase
      .from("mcp_predictions")
      .select("*")
      .gte("event_date", from)
      .lte("event_date", to)
      .order("event_date");

    if (error) { logger.warn("mcpData: predictions read failed", error.message); return []; }
    const result = (data ?? []) as McpPrediction[];
    cache.set(cacheKey, result, TTL.ENRICHED_MATCH);
    return result;
  } catch (err) {
    logger.warn("mcpData: predictions fetch error", String(err));
    return [];
  }
}

/** Find a prediction by fuzzy team name match. */
export function findMcpPrediction(
  homeTeam: string,
  awayTeam: string,
  predictions: McpPrediction[]
): McpPrediction | null {
  const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, "");
  const h = norm(homeTeam);
  const a = norm(awayTeam);
  for (const p of predictions) {
    const ph = norm(p.home_team);
    const pa = norm(p.away_team);
    if (
      (ph.includes(h.slice(0, 6)) || h.includes(ph.slice(0, 6))) &&
      (pa.includes(a.slice(0, 6)) || a.includes(pa.slice(0, 6)))
    ) {
      return p;
    }
  }
  return null;
}

// ── Odds ──────────────────────────────────────────────────────────────────────

/** Fetch all MCP odds for upcoming events. Grouped by event_id internally. */
export async function getMcpOddsMap(daysAhead = 7): Promise<Map<number, McpOddsRow[]>> {
  const cacheKey = `mcp:odds:${daysAhead}`;
  const cached = cache.get<Map<number, McpOddsRow[]>>(cacheKey);
  if (cached) return cached;

  if (!supabase) return new Map();
  try {
    // Join with predictions to filter by date range
    const from = new Date().toISOString();
    const to = new Date(Date.now() + daysAhead * 86_400_000).toISOString();

    // Get event_ids for upcoming predictions
    const { data: preds } = await supabase
      .from("mcp_predictions")
      .select("event_id")
      .gte("event_date", from)
      .lte("event_date", to);

    if (!preds?.length) return new Map();
    const eventIds = preds.map((p: { event_id: number }) => p.event_id);

    const { data, error } = await supabase
      .from("mcp_odds")
      .select("*")
      .in("event_id", eventIds);

    if (error) { logger.warn("mcpData: odds read failed", error.message); return new Map(); }

    const map = new Map<number, McpOddsRow[]>();
    for (const row of (data ?? []) as McpOddsRow[]) {
      if (!map.has(row.event_id)) map.set(row.event_id, []);
      map.get(row.event_id)!.push(row);
    }
    cache.set(cacheKey, map, TTL.ENRICHED_MATCH);
    return map;
  } catch (err) {
    logger.warn("mcpData: odds fetch error", String(err));
    return new Map();
  }
}

/** Convert MCP odds rows for one event into the shared MatchOdds format. */
export function mcpOddsToMatchOdds(eventId: number, rows: McpOddsRow[]): MatchOdds | null {
  if (!rows.length) return null;

  // Group rows by bookmaker within each market
  const market1x2 = rows.filter((r) => r.market === "1x2");
  const marketOU25 = rows.filter((r) => r.market === "over_under_25");
  const marketBTTS = rows.filter((r) => r.market === "btts");

  const get = (market: McpOddsRow[], outcome: string) =>
    market.find((r) => r.outcome === outcome)?.decimal_odds ?? null;

  const bm: BookmakerOdds = {
    bookmaker: "mcp_best",
    lastUpdate: rows[0]?.updated_at ?? new Date().toISOString(),
    home: get(market1x2, "HOME"),
    draw: get(market1x2, "DRAW"),
    away: get(market1x2, "AWAY"),
    over25: get(marketOU25, "OVER"),
    under25: get(marketOU25, "UNDER"),
    btts_yes: get(marketBTTS, "YES"),
    btts_no: get(marketBTTS, "NO"),
  };

  if (!bm.home && !bm.draw && !bm.away) return null;

  return {
    matchId: `mcp_${eventId}`,
    bookmakers: [bm],
    playerProps: [],
    lastUpdated: bm.lastUpdate,
  };
}

// ── Fixtures ──────────────────────────────────────────────────────────────────

/** Fetch live and upcoming fixtures from mcp_fixtures table. */
export async function getMcpFixtures(date?: string): Promise<McpFixture[]> {
  const today = date ?? new Date().toISOString().slice(0, 10);
  const cacheKey = `mcp:fixtures:${today}`;
  const cached = cache.get<McpFixture[]>(cacheKey);
  if (cached) return cached;

  if (!supabase) return [];
  try {
    const from = today + "T00:00:00Z";
    const to = today + "T23:59:59Z";
    const { data, error } = await supabase
      .from("mcp_fixtures")
      .select("*")
      .gte("event_date", from)
      .lte("event_date", to)
      .order("event_date");

    if (error) { logger.warn("mcpData: fixtures read failed", error.message); return []; }
    const result = (data ?? []) as McpFixture[];
    cache.set(cacheKey, result, 5 * 60); // 5 min — fixtures update live
    return result;
  } catch (err) {
    logger.warn("mcpData: fixtures fetch error", String(err));
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Convert MCP prediction probabilities to the bzzoiro-compatible Poisson input. */
export function mcpPredToPoissonInput(pred: McpPrediction) {
  return {
    homeWinProb:  (pred.prob_home  ?? 33) / 100,
    drawProb:     (pred.prob_draw  ?? 33) / 100,
    awayWinProb:  (pred.prob_away  ?? 33) / 100,
    probOver25:   (pred.prob_over_25 ?? 50) / 100,
    probBTTS:     (pred.prob_btts_yes ?? 50) / 100,
    xgHome:       pred.xg_home ?? null,
    xgAway:       pred.xg_away ?? null,
  };
}
