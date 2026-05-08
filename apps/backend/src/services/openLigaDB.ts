import { cache, TTL } from "../cache";
import { logger } from "../logger";

const BASE = "https://api.openligadb.de";

export interface OLDBMatch {
  matchID: number;
  matchDateTimeUTC: string;
  matchIsFinished: boolean;
  team1: { teamId: number; teamName: string; teamIconUrl: string };
  team2: { teamId: number; teamName: string; teamIconUrl: string };
  matchResults: Array<{ resultTypeID: number; pointsTeam1: number; pointsTeam2: number }>;
}

export const openLigaDB = {
  async getMatchData(league = "bl1", year = 2025): Promise<OLDBMatch[]> {
    const url = `${BASE}/getmatchdata/${league}/${year}`;
    const cached = cache.get<OLDBMatch[]>(url);
    if (cached) return cached;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return [];
      const data = (await res.json()) as OLDBMatch[];
      cache.set(url, data, TTL.FOOTBALL_DATA_MATCHES);
      return data;
    } catch (err) {
      logger.debug("OpenLigaDB failed", { league, err: String(err) });
      return [];
    }
  },

  async getTodayMatches(league = "bl1", year = 2025): Promise<OLDBMatch[]> {
    const all = await openLigaDB.getMatchData(league, year);
    const today = new Date().toISOString().slice(0, 10);
    return all.filter((m) => m.matchDateTimeUTC.slice(0, 10) === today);
  },
};
