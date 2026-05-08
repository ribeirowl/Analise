import { logger } from "./logger";

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
  createdAt: number;
}

class MemoryCache {
  private store = new Map<string, CacheEntry<unknown>>();
  private hitCount = 0;
  private missCount = 0;

  set<T>(key: string, data: T, ttlMs: number): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
      createdAt: Date.now(),
    });
  }

  get<T>(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) {
      this.missCount++;
      return null;
    }
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      this.missCount++;
      return null;
    }
    this.hitCount++;
    return entry.data as T;
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }

  size(): number {
    return this.store.size;
  }

  stats() {
    return { hits: this.hitCount, misses: this.missCount, size: this.store.size };
  }

  // Remove expired entries
  prune(): void {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.store.entries()) {
      if (now > entry.expiresAt) {
        this.store.delete(key);
        pruned++;
      }
    }
    if (pruned > 0) logger.debug(`Cache pruned ${pruned} expired entries`);
  }
}

export const cache = new MemoryCache();

// Prune every 10 minutes
setInterval(() => cache.prune(), 10 * 60 * 1000);

// TTL constants (ms)
export const TTL = {
  FOOTBALL_DATA_MATCHES: 5 * 60 * 1000,       // 5 min
  FOOTBALL_DATA_TEAM: 60 * 60 * 1000,          // 1h
  SOFASCORE_LINEUPS: 30 * 60 * 1000,           // 30 min
  SOFASCORE_STATS: 6 * 60 * 60 * 1000,         // 6h
  SOFASCORE_EVENT: 5 * 60 * 1000,              // 5 min
  ODDS_API: 30 * 60 * 1000,                    // 30 min (save quota)
  ENRICHED_MATCH: 5 * 60 * 1000,               // 5 min
  VALUE_PICKS: 5 * 60 * 1000,                  // 5 min
};
