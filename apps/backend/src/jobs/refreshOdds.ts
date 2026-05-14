import cron from "node-cron";
import { cache } from "../cache";
import { logger } from "../logger";
import { getEnrichedTodayMatches } from "../aggregator/matches";
import { supabase } from "../services/supabase";

function dateOffset(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

async function hasMatchesInDB(date: string): Promise<boolean> {
  if (!supabase) return false;
  const { count } = await supabase
    .from("matches")
    .select("id", { count: "exact", head: true })
    .gte("match_date", `${date}T00:00:00Z`)
    .lt("match_date", `${date}T23:59:59Z`);
  return (count ?? 0) > 0;
}

async function refreshDate(date: string, force = false): Promise<void> {
  // Skip if data is already in DB and we're not forcing a refresh
  if (!force) {
    const alreadyStored = await hasMatchesInDB(date);
    if (alreadyStored) {
      logger.debug(`Cron: ${date} already in DB, skipping API fetch`);
      return;
    }
  }
  // Invalidate in-memory cache so a fresh fetch happens
  cache.delete(`enriched:list:${date}`);
  // Also clear odds cache
  cache.delete(`af:/fixtures?date=${date}`);
  await getEnrichedTodayMatches(date);
  logger.info(`Cron: refreshed ${date}`);
}

export function startRefreshJobs(): void {
  // On startup: proactively fetch today + next 2 days
  setImmediate(async () => {
    logger.info("Startup: pre-fetching fixtures for today and next 2 days...");
    for (let i = 0; i <= 2; i++) {
      try {
        await refreshDate(dateOffset(i), false);
      } catch (err) {
        logger.warn(`Startup fetch failed for ${dateOffset(i)}`, String(err));
      }
    }
  });

  // Every 15 minutes during the day: refresh today's matches
  // (live scores update, new picks detected)
  cron.schedule("*/15 * * * *", async () => {
    const today = dateOffset(0);
    logger.info(`Cron (15m): force-refreshing ${today}`);
    try {
      await refreshDate(today, true);
    } catch (err) {
      logger.error("Cron (15m): refresh failed", String(err));
    }
  });

  // Every 6 hours: refresh tomorrow's fixtures (in case new games are scheduled)
  cron.schedule("0 */6 * * *", async () => {
    const tomorrow = dateOffset(1);
    logger.info(`Cron (6h): refreshing ${tomorrow}`);
    try {
      // Force refresh tomorrow since schedule can change
      cache.delete(`enriched:list:${tomorrow}`);
      await getEnrichedTodayMatches(tomorrow);
    } catch (err) {
      logger.warn("Cron (6h): tomorrow refresh failed", String(err));
    }
  });

  // Daily at 06:00 UTC: pre-fetch day+2 fixtures
  cron.schedule("0 6 * * *", async () => {
    const dayPlusTwo = dateOffset(2);
    logger.info(`Cron (daily): pre-fetching ${dayPlusTwo}`);
    try {
      cache.delete(`enriched:list:${dayPlusTwo}`);
      await getEnrichedTodayMatches(dayPlusTwo);
    } catch (err) {
      logger.warn("Cron (daily): day+2 fetch failed", String(err));
    }
  });

  logger.info("Refresh jobs started (15min live, 6h tomorrow, daily day+2)");
}
