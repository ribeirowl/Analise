import type { EnrichedMatch, ValuePick, BookmakerOdds, TeamSeasonStats } from "@analise-futebol/shared";
import type { BzzoiroMatchData } from "../services/bzzoiro";
import { bzzoiroProbToPoisson } from "../services/bzzoiro";
import type { McpPrediction } from "../services/mcpData";
import { mcpPredToPoissonInput } from "../services/mcpData";

const MIN_EDGE = 0.05;

export interface PoissonInput {
  homeExpectedGoals: number;
  awayExpectedGoals: number;
  eloDiff?: number;
}

export function buildPoissonInput(
  homeStats: TeamSeasonStats | null,
  awayStats: TeamSeasonStats | null,
  eloDiff = 0,
  homeXG?: number,
  awayXG?: number
): PoissonInput {
  const gp_h = Math.max(homeStats?.gamesPlayed ?? 1, 1);
  const gp_a = Math.max(awayStats?.gamesPlayed ?? 1, 1);

  // Prefer home/away specific averages from the new rich stats if available
  let homeAvgGF = (homeStats?.homeAvgGoalsFor ?? homeStats?.avgGoalsFor ?? ((homeStats?.goalsScored ?? 0) / gp_h)) || 1.3;
  let awayAvgGF = (awayStats?.awayAvgGoalsFor ?? awayStats?.avgGoalsFor ?? ((awayStats?.goalsScored ?? 0) / gp_a)) || 1.1;
  const homeAvgGA = (homeStats?.homeAvgGoalsAgainst ?? homeStats?.avgGoalsAgainst ?? ((homeStats?.goalsConceded ?? 0) / gp_h)) || 1.2;
  const awayAvgGA = (awayStats?.awayAvgGoalsAgainst ?? awayStats?.avgGoalsAgainst ?? ((awayStats?.goalsConceded ?? 0) / gp_a)) || 1.4;

  // Blend with xG from Understat when available (more predictive)
  if (homeXG) homeAvgGF = homeAvgGF * 0.4 + homeXG * 0.6;
  if (awayXG) awayAvgGF = awayAvgGF * 0.4 + awayXG * 0.6;

  // Dixon-Coles style: attack × defense of opponent / league avg
  const leagueAvg = 1.25;
  const homeExpected = (homeAvgGF / leagueAvg) * (awayAvgGA / leagueAvg) * leagueAvg;
  const awayExpected = (awayAvgGF / leagueAvg) * (homeAvgGA / leagueAvg) * leagueAvg;

  // Elo adjustment: every 200 Elo points → ~0.2 expected goals difference
  const eloAdj = eloDiff / 1000;

  return {
    homeExpectedGoals: Math.max(homeExpected + eloAdj + 0.3, 0.1), // +0.3 home advantage
    awayExpectedGoals: Math.max(awayExpected - eloAdj, 0.1),
    eloDiff,
  };
}

type ProbInput = {
  homeWinProb: number; drawProb: number; awayWinProb: number;
  probOver25: number; probBTTS: number;
};

function _picksFromProbs(match: EnrichedMatch, probs: ProbInput, tag: string): ValuePick[] {
  if (!match.odds || match.odds.bookmakers.length === 0) return [];
  const picks: ValuePick[] = [];
  const best = getBestOdds(match.odds.bookmakers);

  if (best.home) checkValue(picks, match, "home_win", `Vitória ${match.homeTeam.name}`, best.home, best.homeBookmaker, probs.homeWinProb);
  if (best.draw) checkValue(picks, match, "draw", "Empate", best.draw, best.drawBookmaker, probs.drawProb);
  if (best.away) checkValue(picks, match, "away_win", `Vitória ${match.awayTeam.name}`, best.away, best.awayBookmaker, probs.awayWinProb);
  if (best.over25) checkValue(picks, match, "over_25", "Mais de 2.5 gols", best.over25, best.over25Bookmaker, probs.probOver25);
  if (best.under25) checkValue(picks, match, "under_25", "Menos de 2.5 gols", best.under25, best.under25Bookmaker, 1 - probs.probOver25);
  if (best.btts_yes) checkValue(picks, match, "btts_yes", "Ambas marcam: Sim", best.btts_yes, best.btts_yes_bookmaker, probs.probBTTS);
  if (best.btts_no) checkValue(picks, match, "btts_no", "Ambas marcam: Não", best.btts_no, best.btts_no_bookmaker, 1 - probs.probBTTS);

  const result = picks.sort((a, b) => b.edge - a.edge);
  if (result.length > 0) {
    console.log(`[${tag}] ${match.homeTeam.name} vs ${match.awayTeam.name}: ${result.length} picks`);
  }
  return result;
}

/** Compute value picks using bzzoiro CatBoost ML probabilities. */
export function findValuePicksFromBzzoiro(match: EnrichedMatch, bz: BzzoiroMatchData): ValuePick[] {
  return _picksFromProbs(match, bzzoiroProbToPoisson(bz), "BZZOIRO");
}

/** Compute value picks using MCP CatBoost ML probabilities. */
export function findValuePicksFromMcpPred(match: EnrichedMatch, pred: McpPrediction): ValuePick[] {
  return _picksFromProbs(match, mcpPredToPoissonInput(pred), "MCP");
}

export function findValuePicks(match: EnrichedMatch, poissonInput?: PoissonInput): ValuePick[] {
  if (!match.odds || match.odds.bookmakers.length === 0) return [];

  // If no explicit input, build from season stats
  const input = poissonInput ?? buildPoissonInput(match.homeSeasonStats, match.awaySeasonStats);
  const { homeExpectedGoals, awayExpectedGoals } = input;

  const picks: ValuePick[] = [];
  const best = getBestOdds(match.odds.bookmakers);

  // ── Poisson probabilities ─────────────────────────────────────────────
  const homeWinProb = poissonHomeWin(homeExpectedGoals, awayExpectedGoals);
  const awayWinProb = poissonAwayWin(homeExpectedGoals, awayExpectedGoals);
  const drawProb = Math.max(1 - homeWinProb - awayWinProb, 0.05);

  const avgGoals = homeExpectedGoals + awayExpectedGoals;
  const probOver25 = poissonOver(avgGoals, 2);
  const probBTTS = (1 - Math.exp(-homeExpectedGoals)) * (1 - Math.exp(-awayExpectedGoals));

  // 1X2
  if (best.home) checkValue(picks, match, "home_win", `Vitória ${match.homeTeam.name}`, best.home, best.homeBookmaker, homeWinProb);
  if (best.draw) checkValue(picks, match, "draw", "Empate", best.draw, best.drawBookmaker, drawProb);
  if (best.away) checkValue(picks, match, "away_win", `Vitória ${match.awayTeam.name}`, best.away, best.awayBookmaker, awayWinProb);

  // Totals
  if (best.over25) checkValue(picks, match, "over_25", "Mais de 2.5 gols", best.over25, best.over25Bookmaker, probOver25);
  if (best.under25) checkValue(picks, match, "under_25", "Menos de 2.5 gols", best.under25, best.under25Bookmaker, 1 - probOver25);

  // BTTS
  if (best.btts_yes) checkValue(picks, match, "btts_yes", "Ambas marcam: Sim", best.btts_yes, best.btts_yes_bookmaker, probBTTS);
  if (best.btts_no) checkValue(picks, match, "btts_no", "Ambas marcam: Não", best.btts_no, best.btts_no_bookmaker, 1 - probBTTS);

  const result = picks.sort((a, b) => b.edge - a.edge);
  if (result.length > 0) {
    const edges = result.map((p) => p.edge.toFixed(3)).join(", ");
    console.log(`[VALUE] ${match.homeTeam.name} vs ${match.awayTeam.name}: ${result.length} picks [${edges}]`);
  }
  return result;
}

function checkValue(
  picks: ValuePick[], match: EnrichedMatch,
  market: ValuePick["market"], description: string,
  odd: number, bookmaker: string, estimatedProb: number
) {
  const impliedProb = 1 / odd;
  const edge = estimatedProb - impliedProb;
  if (edge >= MIN_EDGE) {
    picks.push({
      matchId: match.id,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      competition: match.competition.name,
      market, description, bookmaker, odd,
      impliedProbability: impliedProb,
      estimatedProbability: estimatedProb,
      edge,
      confidence: edge >= 0.12 ? "high" : edge >= 0.08 ? "medium" : "low",
    });
  }
}

interface BestOdds {
  home: number | null; homeBookmaker: string;
  draw: number | null; drawBookmaker: string;
  away: number | null; awayBookmaker: string;
  over25: number | null; over25Bookmaker: string;
  under25: number | null; under25Bookmaker: string;
  btts_yes: number | null; btts_yes_bookmaker: string;
  btts_no: number | null; btts_no_bookmaker: string;
}

function getBestOdds(bookmakers: BookmakerOdds[]): BestOdds {
  const r: BestOdds = {
    home: null, homeBookmaker: "", draw: null, drawBookmaker: "",
    away: null, awayBookmaker: "", over25: null, over25Bookmaker: "",
    under25: null, under25Bookmaker: "", btts_yes: null, btts_yes_bookmaker: "",
    btts_no: null, btts_no_bookmaker: "",
  };
  for (const bm of bookmakers) {
    if (bm.home && (!r.home || bm.home > r.home)) { r.home = bm.home; r.homeBookmaker = bm.bookmaker; }
    if (bm.draw && (!r.draw || bm.draw > r.draw)) { r.draw = bm.draw; r.drawBookmaker = bm.bookmaker; }
    if (bm.away && (!r.away || bm.away > r.away)) { r.away = bm.away; r.awayBookmaker = bm.bookmaker; }
    if (bm.over25 && (!r.over25 || bm.over25 > r.over25)) { r.over25 = bm.over25; r.over25Bookmaker = bm.bookmaker; }
    if (bm.under25 && (!r.under25 || bm.under25 > r.under25)) { r.under25 = bm.under25; r.under25Bookmaker = bm.bookmaker; }
    if (bm.btts_yes && (!r.btts_yes || bm.btts_yes > r.btts_yes)) { r.btts_yes = bm.btts_yes; r.btts_yes_bookmaker = bm.bookmaker; }
    if (bm.btts_no && (!r.btts_no || bm.btts_no > r.btts_no)) { r.btts_no = bm.btts_no; r.btts_no_bookmaker = bm.bookmaker; }
  }
  return r;
}

// ── Poisson distribution math ─────────────────────────────────────────────
function poissonProb(lambda: number, k: number): number {
  return (Math.exp(-lambda) * Math.pow(lambda, k)) / factorial(k);
}

function poissonOver(lambda: number, k: number): number {
  let p = 0;
  for (let i = 0; i <= k; i++) p += poissonProb(lambda, i);
  return 1 - p;
}

function poissonHomeWin(lambdaH: number, lambdaA: number): number {
  let prob = 0;
  for (let h = 1; h <= 8; h++)
    for (let a = 0; a < h; a++)
      prob += poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
  return prob;
}

function poissonAwayWin(lambdaH: number, lambdaA: number): number {
  let prob = 0;
  for (let a = 1; a <= 8; a++)
    for (let h = 0; h < a; h++)
      prob += poissonProb(lambdaH, h) * poissonProb(lambdaA, a);
  return prob;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  let r = 1;
  for (let i = 2; i <= n; i++) r *= i;
  return r;
}
