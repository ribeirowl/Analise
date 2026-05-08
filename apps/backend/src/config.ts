import { z } from "zod";

const envSchema = z.object({
  FOOTBALL_DATA_API_KEY: z.string().min(1, "FOOTBALL_DATA_API_KEY is required"),
  ODDS_API_KEY: z.string().min(1, "ODDS_API_KEY is required"),
  ODDS_API_REGIONS: z.string().default("eu,uk"),
  ODDS_API_BOOKMAKERS: z.string().default("bet365,pinnacle,betfair_ex_eu"),
  SOFASCORE_USER_AGENT: z
    .string()
    .default("Mozilla/5.0 (compatible; FutebolAnalise/1.0; educational)"),
  PORT: z.coerce.number().default(3001),
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
});

// Load .env manually for Node 20+ without dotenv
import { readFileSync } from "fs";
import { join } from "path";

try {
  const envPath = join(process.cwd(), ".env");
  const raw = readFileSync(envPath, "utf-8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const [key, ...rest] = trimmed.split("=");
    const value = rest.join("=").trim();
    if (key && !(key in process.env)) {
      process.env[key.trim()] = value;
    }
  }
} catch {
  // .env not found — rely on actual environment variables
}

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  console.error("❌  Invalid environment variables:");
  for (const issue of parsed.error.issues) {
    console.error(`   ${issue.path.join(".")}: ${issue.message}`);
  }
  console.error("\nCopy .env.example to .env and fill in the values.");
  process.exit(1);
}

export const config = parsed.data;
