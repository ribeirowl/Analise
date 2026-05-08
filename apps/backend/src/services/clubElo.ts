import { cache } from "../cache";
import { logger } from "../logger";

export interface EloRating { rank: number; club: string; country: string; elo: number; from: string; to: string }

export const clubElo = {
  async getRating(teamName: string): Promise<EloRating | null> {
    const key = `elo:${teamName.toLowerCase().replace(/\s+/g, "_")}`;
    const cached = cache.get<EloRating>(key);
    if (cached) return cached;

    try {
      const res = await fetch(`http://api.clubelo.com/${encodeURIComponent(teamName)}`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      });
      if (!res.ok) return null;
      const csv = await res.text();
      const lines = csv.split("\n").slice(1).filter(Boolean);
      if (!lines.length) return null;
      const latest = lines[lines.length - 1].split(",");
      const result: EloRating = {
        rank: parseInt(latest[1]),
        club: latest[2],
        country: latest[3],
        elo: parseFloat(latest[4]),
        from: latest[5],
        to: latest[6],
      };
      cache.set(key, result, 24 * 3600 * 1000);
      return result;
    } catch (err) {
      logger.debug("ClubElo failed", { teamName, err: String(err) });
      return null;
    }
  },

  async getEloDiff(homeTeam: string, awayTeam: string): Promise<number> {
    const [home, away] = await Promise.all([
      clubElo.getRating(homeTeam),
      clubElo.getRating(awayTeam),
    ]);
    if (!home || !away) return 0;
    return home.elo - away.elo;
  },
};
