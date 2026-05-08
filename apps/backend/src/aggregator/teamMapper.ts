import stringSimilarity from "string-similarity";
import { cache } from "../cache";

// Manual mapping: football-data.org team ID -> sofascore team ID
const MANUAL_MAP: Record<number, number> = {
  // Premier League
  57: 1,    // Arsenal
  58: 38,   // Aston Villa
  61: 48,   // Chelsea
  62: 50,   // Everton
  64: 40,   // Liverpool
  65: 382,  // Man City
  66: 35,   // Man United
  67: 39,   // Newcastle
  73: 45,   // Tottenham
  563: 3,   // West Ham
  // La Liga
  77: 95,   // Athletic Club
  78: 2817, // Atletico Madrid
  86: 2829, // Real Betis
  559: 2,   // Sevilla
  81: 2692, // Barcelona
  // Serie A
  109: 84,  // Juventus
  108: 118, // Inter Milan
  98: 103,  // AC Milan
  // Bundesliga
  5: 368,   // Bayern Munich
  4: 673,   // Borussia Dortmund
  // Brasileirao
  1765: 1961, // Flamengo
  1772: 5926, // Palmeiras
  1776: 1963, // Corinthians
  5602: 8900, // Atletico MG
};

// Soft name map for fuzzy matching when IDs don't match
const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();

export function getSofascoreTeamId(
  fdId: number,
  teamName: string,
  sofascoreEvents: Array<{ homeTeam: { id: number; name: string }; awayTeam: { id: number; name: string } }>
): number | null {
  // 1. Manual map
  if (MANUAL_MAP[fdId]) return MANUAL_MAP[fdId];

  // 2. Cache lookup
  const cacheKey = `tmap:${fdId}`;
  const cached = cache.get<number>(cacheKey);
  if (cached) return cached;

  // 3. Fuzzy match against sofascore events
  const candidates: Array<{ id: number; name: string }> = [];
  for (const ev of sofascoreEvents) {
    candidates.push(ev.homeTeam, ev.awayTeam);
  }

  if (candidates.length === 0) return null;

  const names = candidates.map((c) => normalize(c.name));
  const target = normalize(teamName);
  const { bestMatch, bestMatchIndex } = stringSimilarity.findBestMatch(target, names);

  if (bestMatch.rating >= 0.6) {
    const ssId = candidates[bestMatchIndex].id;
    cache.set(cacheKey, ssId, 24 * 60 * 60 * 1000); // 24h
    MANUAL_MAP[fdId] = ssId; // warm the manual map
    return ssId;
  }

  return null;
}

// Map sofascore tournament to competition info
export function getSofascoreTournamentInfo(
  competitionName: string,
  sofascoreEvents: Array<{ tournament: { id: number; name: string; uniqueTournament?: { id: number; seasons?: Array<{ id: number }> } } }>
): { tournamentId: number; seasonId: number } | null {
  const cacheKey = `tinfo:${normalize(competitionName)}`;
  const cached = cache.get<{ tournamentId: number; seasonId: number }>(cacheKey);
  if (cached) return cached;

  const target = normalize(competitionName);
  let best: { tournamentId: number; seasonId: number; score: number } | null = null;

  for (const ev of sofascoreEvents) {
    const tName = normalize(ev.tournament.name);
    const score = stringSimilarity.compareTwoStrings(target, tName);
    if (score > (best?.score ?? 0.4)) {
      const ut = ev.tournament.uniqueTournament;
      if (ut) {
        best = {
          tournamentId: ut.id,
          seasonId: ut.seasons?.[0]?.id ?? 0,
          score,
        };
      }
    }
  }

  if (best) {
    const result = { tournamentId: best.tournamentId, seasonId: best.seasonId };
    cache.set(cacheKey, result, 6 * 60 * 60 * 1000);
    return result;
  }

  return null;
}
