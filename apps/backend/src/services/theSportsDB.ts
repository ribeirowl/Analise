import { config } from "../config";
import { cache } from "../cache";
import { logger } from "../logger";

const KEY = config.THESPORTSDB_KEY;
const BASE = `https://www.thesportsdb.com/api/v1/json/${KEY}`;
const TTL_7D = 7 * 24 * 60 * 60 * 1000;

export interface SDBTeam {
  logo: string | null;
  banner: string | null;
  stadium: string | null;
  stadiumThumb: string | null;
  country: string | null;
  description: string | null;
  founded: string | null;
}

export interface SDBPlayer {
  thumbnail: string | null;
  cutout: string | null;
  position: string | null;
  birthYear: string | null;
  nationality: string | null;
}

export const theSportsDB = {
  async searchTeam(name: string): Promise<SDBTeam | null> {
    const cacheKey = `sdb:team:${name.toLowerCase()}`;
    const cached = cache.get<SDBTeam>(cacheKey);
    if (cached) return cached;
    try {
      const res = await fetch(`${BASE}/searchteams.php?t=${encodeURIComponent(name)}`);
      if (!res.ok) return null;
      const data = await res.json() as { teams: Array<Record<string, string>> | null };
      const t = data.teams?.[0];
      if (!t) return null;
      const result: SDBTeam = {
        logo: t.strBadge ?? null,
        banner: t.strBanner ?? null,
        stadium: t.strStadium ?? null,
        stadiumThumb: t.strStadiumThumb ?? null,
        country: t.strCountry ?? null,
        description: t.strDescriptionEN ?? null,
        founded: t.intFormedYear ?? null,
      };
      cache.set(cacheKey, result, TTL_7D);
      return result;
    } catch (err) {
      logger.debug("TheSportsDB team failed", { name, err: String(err) });
      return null;
    }
  },

  async searchPlayer(name: string): Promise<SDBPlayer | null> {
    const cacheKey = `sdb:player:${name.toLowerCase()}`;
    const cached = cache.get<SDBPlayer>(cacheKey);
    if (cached) return cached;
    try {
      const res = await fetch(`${BASE}/searchplayers.php?p=${encodeURIComponent(name)}`);
      if (!res.ok) return null;
      const data = await res.json() as { player: Array<Record<string, string>> | null };
      const p = data.player?.[0];
      if (!p) return null;
      const result: SDBPlayer = {
        thumbnail: p.strThumb ?? null,
        cutout: p.strCutout ?? null,
        position: p.strPosition ?? null,
        birthYear: p.dateBorn ?? null,
        nationality: p.strNationality ?? null,
      };
      cache.set(cacheKey, result, TTL_7D);
      return result;
    } catch (err) {
      logger.debug("TheSportsDB player failed", { name, err: String(err) });
      return null;
    }
  },
};
