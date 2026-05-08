import { cache, TTL } from "../cache";
import { logger } from "../logger";

const LEAGUE_CODES: Record<string, string> = {
  PL: "eng.1", LaLiga: "esp.1", SerieA: "ita.1",
  Bundesliga: "ger.1", Ligue1: "fra.1", Brasileirao: "bra.1",
  Libertadores: "conmebol.libertadores", UCL: "uefa.champions",
  Eredivisie: "ned.1", PrimeiraLiga: "por.1",
};

export interface ESPNEvent {
  id: string;
  name: string;
  shortName: string;
  date: string;
  status: { type: { name: string; completed: boolean } };
  competitions: Array<{
    competitors: Array<{
      id: string; team: { id: string; name: string; logo: string }; score: string; homeAway: "home" | "away";
    }>;
    venue?: { fullName: string };
  }>;
}

export const espn = {
  async getScoreboard(leagueKey: string): Promise<ESPNEvent[]> {
    const code = LEAGUE_CODES[leagueKey];
    if (!code) return [];
    const url = `https://site.api.espn.com/apis/site/v2/sports/soccer/${code}/scoreboard`;
    const cached = cache.get<ESPNEvent[]>(url);
    if (cached) return cached;
    try {
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) return [];
      const data = await res.json() as { events: ESPNEvent[] };
      const events = data.events ?? [];
      cache.set(url, events, TTL.FOOTBALL_DATA_MATCHES);
      return events;
    } catch (err) {
      logger.debug("ESPN scoreboard failed", { leagueKey, err: String(err) });
      return [];
    }
  },

  async getAllScoreboards(): Promise<ESPNEvent[]> {
    const keys = Object.keys(LEAGUE_CODES);
    const results: ESPNEvent[] = [];
    await Promise.allSettled(
      keys.map((k) => espn.getScoreboard(k).then((evs) => results.push(...evs)))
    );
    return results;
  },
};
