import cron from "node-cron";
import { cache } from "../cache";
import { logger } from "../logger";
import { getEnrichedTodayMatches } from "../aggregator/matches";

export function startRefreshJobs(): void {
  // Refresh today's enriched matches every 5 minutes
  cron.schedule("*/5 * * * *", async () => {
    const today = new Date().toISOString().slice(0, 10);
    logger.info("Cron: refreshing today's matches...");
    try {
      // Invalidate cache then re-fetch
      cache.delete(`enriched:${today}`);
      await getEnrichedTodayMatches(today);
      logger.info("Cron: matches refreshed");
    } catch (err) {
      logger.error("Cron: match refresh failed", String(err));
    }
  });

  // Refresh odds every 30 min (saves API quota)
  cron.schedule("*/30 * * * *", async () => {
    const today = new Date().toISOString().slice(0, 10);
    logger.info("Cron: refreshing odds...");
    try {
      // Invalidate odds-related caches
      cache.delete(`enriched:${today}`);
      logger.info("Cron: odds cache cleared, will refresh on next request");
    } catch (err) {
      logger.error("Cron: odds refresh failed", String(err));
    }
  });

  logger.info("Refresh jobs started (matches: 5min, odds: 30min)");
}
