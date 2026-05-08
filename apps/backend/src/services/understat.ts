import { load } from "cheerio";
import { cache } from "../cache";
import { logger } from "../logger";

const LEAGUES: Record<string, string> = {
  EPL: "EPL", LaLiga: "La_Liga", Bundesliga: "Bundesliga",
  SerieA: "Serie_A", Ligue1: "Ligue_1",
};

export interface UnderstatTeamXG {
  title: string;
  xG: number;
  xGA: number;
  npxG: number;
  npxGA: number;
  scored: number;
  missed: number;
}

export const understat = {
  async getLeagueXG(leagueKey: string, season = 2025): Promise<Record<string, UnderstatTeamXG> | null> {
    const slug = LEAGUES[leagueKey];
    if (!slug) return null;
    const url = `https://understat.com/league/${slug}/${season}`;
    const cacheKey = `us:${leagueKey}:${season}`;
    const cached = cache.get<Record<string, UnderstatTeamXG>>(cacheKey);
    if (cached) return cached;

    try {
      const res = await fetch(url, {
        headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
      });
      if (!res.ok) return null;
      const html = await res.text();
      const $ = load(html);
      const script = $("script")
        .filter((_, el) => $(el).text().includes("teamsData"))
        .first()
        .text();
      const match = script.match(/JSON\.parse\('(.+?)'\)/s);
      if (!match) return null;
      const decoded = match[1].replace(/\\x([0-9A-Fa-f]{2})/g, (_, h) =>
        String.fromCharCode(parseInt(h, 16))
      );
      const raw = JSON.parse(decoded) as Record<string, { title: string; history: Array<Record<string, unknown>> }>;
      const result: Record<string, UnderstatTeamXG> = {};
      for (const [, team] of Object.entries(raw)) {
        const h = team.history;
        const xG = h.reduce((s, r) => s + Number(r.xG ?? 0), 0) / Math.max(h.length, 1);
        const xGA = h.reduce((s, r) => s + Number(r.xGA ?? 0), 0) / Math.max(h.length, 1);
        result[team.title.toLowerCase()] = {
          title: team.title,
          xG, xGA,
          npxG: h.reduce((s, r) => s + Number(r.npxG ?? 0), 0) / Math.max(h.length, 1),
          npxGA: h.reduce((s, r) => s + Number(r.npxGA ?? 0), 0) / Math.max(h.length, 1),
          scored: h.reduce((s, r) => s + Number(r.scored ?? 0), 0),
          missed: h.reduce((s, r) => s + Number(r.missed ?? 0), 0),
        };
      }
      cache.set(cacheKey, result, 24 * 60 * 60 * 1000);
      return result;
    } catch (err) {
      logger.debug("Understat failed", { leagueKey, err: String(err) });
      return null;
    }
  },

  findTeamXG(data: Record<string, UnderstatTeamXG>, teamName: string): UnderstatTeamXG | null {
    const key = teamName.toLowerCase();
    if (data[key]) return data[key];
    // partial match
    for (const [k, v] of Object.entries(data)) {
      if (key.includes(k.slice(0, 5)) || k.includes(key.slice(0, 5))) return v;
    }
    return null;
  },
};
