import { createClient } from "@supabase/supabase-js";
import { config } from "../config";
import { logger } from "../logger";
import type { EnrichedMatch, ValuePick } from "@analise-futebol/shared";

export const supabase = config.SUPABASE_URL && config.SUPABASE_ANON_KEY
  ? createClient(config.SUPABASE_URL, config.SUPABASE_ANON_KEY)
  : null;

function isEnabled(): boolean {
  if (!supabase) {
    logger.debug("Supabase not configured — skipping persistence");
    return false;
  }
  return true;
}

// ── Persist match ─────────────────────────────────────────────────────────
export async function upsertMatch(match: EnrichedMatch): Promise<void> {
  if (!isEnabled()) return;
  const { error } = await supabase!.from("matches").upsert({
    id: match.id,
    home_team: match.homeTeam.name,
    away_team: match.awayTeam.name,
    competition: match.competition.name,
    match_date: match.utcDate,
    status: match.status,
    home_score: match.score.fullTime.home,
    away_score: match.score.fullTime.away,
    venue: match.venue ?? null,
    referee: match.referee ?? null,
  }, { onConflict: "id" });
  if (error) logger.warn("Supabase upsertMatch failed", error.message);
}

// ── Persist value picks ────────────────────────────────────────────────────
export async function saveValuePicks(picks: ValuePick[], matchDate: string): Promise<void> {
  if (!isEnabled() || picks.length === 0) return;

  // Upsert match first (FK dependency)
  const rows = picks.map((p) => ({
    match_id: p.matchId,
    home_team: p.homeTeam,
    away_team: p.awayTeam,
    competition: p.competition,
    market: p.market,
    description: p.description,
    bookmaker: p.bookmaker,
    odd: p.odd,
    implied_probability: p.impliedProbability,
    estimated_probability: p.estimatedProbability,
    edge: p.edge,
    confidence: p.confidence,
    match_date: matchDate,
  }));

  const { error } = await supabase!.from("value_picks").insert(rows);
  if (error) logger.warn("Supabase saveValuePicks failed", error.message);
  else logger.info(`Supabase: saved ${rows.length} value picks`);
}

// ── Persist odds snapshot ──────────────────────────────────────────────────
export async function saveOddsSnapshot(match: EnrichedMatch): Promise<void> {
  if (!isEnabled() || !match.odds) return;

  const rows = match.odds.bookmakers.slice(0, 5).map((bm) => ({
    match_id: match.id,
    bookmaker: bm.bookmaker,
    home_odd: bm.home,
    draw_odd: bm.draw,
    away_odd: bm.away,
    over25: bm.over25,
    under25: bm.under25,
    btts_yes: bm.btts_yes,
    btts_no: bm.btts_no,
  }));

  const { error } = await supabase!.from("odds_history").insert(rows);
  if (error) logger.warn("Supabase saveOddsSnapshot failed", error.message);
}

// ── Update pick result (after match ends) ─────────────────────────────────
export async function updatePickResult(
  matchId: string,
  homeScore: number,
  awayScore: number
): Promise<void> {
  if (!isEnabled()) return;

  const { data: picks, error } = await supabase!
    .from("value_picks")
    .select("*")
    .eq("match_id", matchId)
    .is("result", null);

  if (error || !picks?.length) return;

  for (const pick of picks) {
    const result = resolveResult(pick.market, homeScore, awayScore);
    if (result === null) continue;

    const profit_loss = result === "win" ? (pick.odd - 1) : result === "loss" ? -1 : 0;
    await supabase!
      .from("value_picks")
      .update({ result, profit_loss })
      .eq("id", pick.id);
  }

  logger.info(`Supabase: updated results for ${picks.length} picks (match ${matchId})`);
}

function resolveResult(
  market: string,
  homeScore: number,
  awayScore: number
): "win" | "loss" | "void" | null {
  const total = homeScore + awayScore;
  switch (market) {
    case "home_win":  return homeScore > awayScore ? "win" : "loss";
    case "away_win":  return awayScore > homeScore ? "win" : "loss";
    case "draw":      return homeScore === awayScore ? "win" : "loss";
    case "over_25":   return total > 2.5 ? "win" : "loss";
    case "under_25":  return total < 2.5 ? "win" : "loss";
    case "btts_yes":  return homeScore > 0 && awayScore > 0 ? "win" : "loss";
    case "btts_no":   return homeScore === 0 || awayScore === 0 ? "win" : "loss";
    default: return null;
  }
}

// ── Read stats from DB ─────────────────────────────────────────────────────
export async function getPicksStats() {
  if (!isEnabled()) return null;
  const { data, error } = await supabase!.from("picks_stats").select("*");
  if (error) { logger.warn("Supabase getPicksStats failed", error.message); return null; }
  return data;
}

export async function getPicksHistory(limit = 50) {
  if (!isEnabled()) return [];
  const { data, error } = await supabase!
    .from("value_picks")
    .select("*")
    .order("match_date", { ascending: false })
    .limit(limit);
  if (error) { logger.warn("Supabase getPicksHistory failed", error.message); return []; }
  return data ?? [];
}

export async function getOddsHistory(matchId: string) {
  if (!isEnabled()) return [];
  const { data, error } = await supabase!
    .from("odds_history")
    .select("*")
    .eq("match_id", matchId)
    .order("recorded_at", { ascending: true });
  if (error) return [];
  return data ?? [];
}
