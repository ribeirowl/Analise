// ─── Competition ───────────────────────────────────────────────────────────
export interface Competition {
  id: number;
  name: string;
  code: string;
  emblem?: string;
  country?: string;
}

// ─── Team ──────────────────────────────────────────────────────────────────
export interface Team {
  id: number;
  name: string;
  shortName?: string;
  crest?: string;
  sofascoreId?: number;
}

// ─── Player / Top Player ───────────────────────────────────────────────────
export interface PlayerStats {
  playerId: number;
  name: string;
  position?: string;
  rating?: number;
  goals?: number;
  assists?: number;
  totalShots?: number;
  shotsOnTarget?: number;
  tackles?: number;
  interceptions?: number;
  keyPasses?: number;
  successfulDribbles?: number;
  yellowCards?: number;
  redCards?: number;
  saves?: number;
  expectedGoals?: number;
  expectedAssists?: number;
  gamesPlayed?: number;
}

// ─── Team Season Stats ─────────────────────────────────────────────────────
export interface TeamSeasonStats {
  teamId: number;
  teamName: string;
  competitionId: number;
  goalsScored?: number;
  goalsConceded?: number;
  avgShotsFor?: number;
  avgShotsAgainst?: number;
  avgPossession?: number;
  avgCorners?: number;
  avgFoulsCommitted?: number;
  avgYellowCards?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  gamesPlayed?: number;
}

// ─── Lineup ────────────────────────────────────────────────────────────────
export interface LineupPlayer {
  playerId: number;
  name: string;
  position?: string;
  jerseyNumber?: number;
  captain?: boolean;
}

export interface Lineup {
  formation?: string;
  players: LineupPlayer[];
  coach?: string;
}

// ─── Odds ──────────────────────────────────────────────────────────────────
export interface BookmakerOdds {
  bookmaker: string;
  lastUpdate: string;
  home: number | null;
  draw: number | null;
  away: number | null;
  over25: number | null;
  under25: number | null;
  btts_yes: number | null;
  btts_no: number | null;
}

export interface PlayerPropOdds {
  bookmaker: string;
  market: string;
  playerName: string;
  line?: number;
  odds: number;
}

export interface MatchOdds {
  matchId: string;
  bookmakers: BookmakerOdds[];
  playerProps: PlayerPropOdds[];
  lastUpdated: string;
}

// ─── Value Pick ────────────────────────────────────────────────────────────
export type ValuePickMarket =
  | "home_win"
  | "draw"
  | "away_win"
  | "over_25"
  | "under_25"
  | "btts_yes"
  | "btts_no"
  | "player_goal"
  | "player_shots_on_target";

export interface ValuePick {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  competition: string;
  market: ValuePickMarket;
  description: string;
  bookmaker: string;
  odd: number;
  impliedProbability: number;
  estimatedProbability: number;
  edge: number; // estimatedProbability - impliedProbability (>0 = valor)
  confidence: "low" | "medium" | "high";
  playerName?: string;
}

// ─── Match ─────────────────────────────────────────────────────────────────
export type MatchStatus =
  | "SCHEDULED"
  | "TIMED"
  | "IN_PLAY"
  | "PAUSED"
  | "FINISHED"
  | "CANCELLED"
  | "POSTPONED"
  | "SUSPENDED";

export interface Score {
  home: number | null;
  away: number | null;
}

export interface Match {
  id: string; // football-data.org ID as string
  sofascoreId?: number;
  oddsApiEventId?: string;
  competition: Competition;
  homeTeam: Team;
  awayTeam: Team;
  utcDate: string;
  status: MatchStatus;
  score: {
    fullTime: Score;
    halfTime: Score;
  };
  venue?: string;
  referee?: string;
}

export interface EnrichedMatch extends Match {
  odds: MatchOdds | null;
  homeLineup: Lineup | null;
  awayLineup: Lineup | null;
  homeTopPlayers: PlayerStats[];
  awayTopPlayers: PlayerStats[];
  homeSeasonStats: TeamSeasonStats | null;
  awaySeasonStats: TeamSeasonStats | null;
  valuePicks: ValuePick[];
  lastEnriched: string;
}

// ─── API Response wrappers ─────────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  cached: boolean;
  timestamp: string;
}

export interface ApiError {
  error: string;
  code?: number;
  timestamp: string;
}

// ─── Health ────────────────────────────────────────────────────────────────
export interface HealthStatus {
  status: "ok" | "degraded";
  uptime: number;
  timestamp: string;
  apis: {
    footballData: "ok" | "error" | "unknown";
    sofascore: "ok" | "error" | "unknown";
    theOddsApi: {
      status: "ok" | "error" | "unknown";
      requestsRemaining?: number;
      requestsUsed?: number;
    };
  };
  cacheSize: number;
}
