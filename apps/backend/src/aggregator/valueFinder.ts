import type { EnrichedMatch, ValuePick, BookmakerOdds, TeamSeasonStats } from "@analise-futebol/shared";

const MIN_EDGE = 0.05; // 5% edge minimum

export function findValuePicks(match: EnrichedMatch): ValuePick[] {
  if (!match.odds || match.odds.bookmakers.length === 0) return [];

  const picks: ValuePick[] = [];

  // Best odds across all bookmakers
  const best = getBestOdds(match.odds.bookmakers);

  // Home stats
  const homeStats = match.homeSeasonStats;
  const awayStats = match.awaySeasonStats;

  // ── 1X2 value ────────────────────────────────────────────────────────────
  if (homeStats && awayStats && best.home && best.draw && best.away) {
    const homeWinProb = estimateHomeWinProb(homeStats, awayStats);
    const drawProb = estimateDrawProb(homeStats, awayStats);
    const awayWinProb = 1 - homeWinProb - drawProb;

    checkValue(picks, match, "home_win", `Vitória ${match.homeTeam.name}`, best.home, best.homeBookmaker, homeWinProb);
    checkValue(picks, match, "draw", "Empate", best.draw, best.drawBookmaker, drawProb);
    checkValue(picks, match, "away_win", `Vitória ${match.awayTeam.name}`, best.away, best.awayBookmaker, awayWinProb);
  }

  // ── Over/Under 2.5 value ──────────────────────────────────────────────────
  if (homeStats && awayStats && best.over25 && best.under25) {
    const avgGoals = estimateAvgGoals(homeStats, awayStats);
    // Poisson approximation P(X>=3) where X ~ Poisson(avgGoals)
    const probOver25 = poissonOver(avgGoals, 2);
    const probUnder25 = 1 - probOver25;

    checkValue(picks, match, "over_25", "Mais de 2.5 gols", best.over25, best.over25Bookmaker, probOver25);
    checkValue(picks, match, "under_25", "Menos de 2.5 gols", best.under25, best.under25Bookmaker, probUnder25);
  }

  // ── BTTS ──────────────────────────────────────────────────────────────────
  if (homeStats && awayStats && best.btts_yes && best.btts_no) {
    const probBTTS = estimateBTTS(homeStats, awayStats);
    checkValue(picks, match, "btts_yes", "Ambas marcam: Sim", best.btts_yes, best.btts_yes_bookmaker, probBTTS);
    checkValue(picks, match, "btts_no", "Ambas marcam: Não", best.btts_no, best.btts_no_bookmaker, 1 - probBTTS);
  }

  return picks.sort((a, b) => b.edge - a.edge);
}

function checkValue(
  picks: ValuePick[],
  match: EnrichedMatch,
  market: ValuePick["market"],
  description: string,
  odd: number,
  bookmaker: string,
  estimatedProb: number
) {
  const impliedProb = 1 / odd;
  const edge = estimatedProb - impliedProb;
  if (edge >= MIN_EDGE) {
    picks.push({
      matchId: match.id,
      homeTeam: match.homeTeam.name,
      awayTeam: match.awayTeam.name,
      competition: match.competition.name,
      market,
      description,
      bookmaker,
      odd,
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
  const result: BestOdds = {
    home: null, homeBookmaker: "",
    draw: null, drawBookmaker: "",
    away: null, awayBookmaker: "",
    over25: null, over25Bookmaker: "",
    under25: null, under25Bookmaker: "",
    btts_yes: null, btts_yes_bookmaker: "",
    btts_no: null, btts_no_bookmaker: "",
  };

  for (const bm of bookmakers) {
    if (bm.home && (result.home === null || bm.home > result.home)) {
      result.home = bm.home; result.homeBookmaker = bm.bookmaker;
    }
    if (bm.draw && (result.draw === null || bm.draw > result.draw)) {
      result.draw = bm.draw; result.drawBookmaker = bm.bookmaker;
    }
    if (bm.away && (result.away === null || bm.away > result.away)) {
      result.away = bm.away; result.awayBookmaker = bm.bookmaker;
    }
    if (bm.over25 && (result.over25 === null || bm.over25 > result.over25)) {
      result.over25 = bm.over25; result.over25Bookmaker = bm.bookmaker;
    }
    if (bm.under25 && (result.under25 === null || bm.under25 > result.under25)) {
      result.under25 = bm.under25; result.under25Bookmaker = bm.bookmaker;
    }
    if (bm.btts_yes && (result.btts_yes === null || bm.btts_yes > result.btts_yes)) {
      result.btts_yes = bm.btts_yes; result.btts_yes_bookmaker = bm.bookmaker;
    }
    if (bm.btts_no && (result.btts_no === null || bm.btts_no > result.btts_no)) {
      result.btts_no = bm.btts_no; result.btts_no_bookmaker = bm.bookmaker;
    }
  }
  return result;
}

// ── Statistical models ────────────────────────────────────────────────────

function estimateHomeWinProb(home: TeamSeasonStats, away: TeamSeasonStats): number {
  const gp_h = home.gamesPlayed ?? 1;
  const gp_a = away.gamesPlayed ?? 1;
  const homeWinRate = (home.wins ?? 0) / gp_h;
  const awayLossRate = (away.losses ?? 0) / gp_a;
  // Simple average with home advantage factor
  const base = (homeWinRate * 0.6 + awayLossRate * 0.4) * 1.05;
  return Math.min(Math.max(base, 0.1), 0.75);
}

function estimateDrawProb(home: TeamSeasonStats, away: TeamSeasonStats): number {
  const gp_h = home.gamesPlayed ?? 1;
  const gp_a = away.gamesPlayed ?? 1;
  const homeDrawRate = (home.draws ?? 0) / gp_h;
  const awayDrawRate = (away.draws ?? 0) / gp_a;
  return Math.min(Math.max((homeDrawRate + awayDrawRate) / 2, 0.1), 0.4);
}

function estimateAvgGoals(home: TeamSeasonStats, away: TeamSeasonStats): number {
  const gp_h = home.gamesPlayed ?? 1;
  const gp_a = away.gamesPlayed ?? 1;
  const homeAvg = (home.goalsScored ?? 0) / gp_h;
  const awayConcede = (away.goalsConceded ?? 0) / gp_a;
  const awayAvg = (away.goalsScored ?? 0) / gp_a;
  const homeConcede = (home.goalsConceded ?? 0) / gp_h;
  return (homeAvg + awayConcede + awayAvg + homeConcede) / 2;
}

function estimateBTTS(home: TeamSeasonStats, away: TeamSeasonStats): number {
  const gp_h = home.gamesPlayed ?? 1;
  const gp_a = away.gamesPlayed ?? 1;
  // P(home scores) * P(away scores)
  const homeScoreRate = Math.min((home.goalsScored ?? 0) / gp_h / 2.5, 0.95);
  const awayScoreRate = Math.min((away.goalsScored ?? 0) / gp_a / 2.5, 0.95);
  return homeScoreRate * awayScoreRate;
}

// Poisson CDF: P(X > k) = 1 - P(X <= k)
function poissonOver(lambda: number, k: number): number {
  let prob = 0;
  for (let i = 0; i <= k; i++) {
    prob += (Math.exp(-lambda) * lambda ** i) / factorial(i);
  }
  return 1 - prob;
}

function factorial(n: number): number {
  if (n <= 1) return 1;
  return n * factorial(n - 1);
}
