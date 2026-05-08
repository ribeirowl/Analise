import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import { config } from "./config";
import { logger } from "./logger";
import { cache } from "./cache";
import { getOddsApiQuota } from "./services/theOddsApi";
import matchesRouter from "./routes/matches";
import oddsRouter from "./routes/odds";
import valueRouter from "./routes/value";
import teamsRouter from "./routes/teams";
import { startRefreshJobs } from "./jobs/refreshOdds";
import type { HealthStatus } from "@analise-futebol/shared";

const app = express();

app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL ?? "*" }));
app.use(morgan("combined"));
app.use(express.json());

// ── Routes ────────────────────────────────────────────────────────────────
app.use("/api/matches", matchesRouter);
app.use("/api/odds", oddsRouter);
app.use("/api/value", valueRouter);
app.use("/api/teams", teamsRouter);

app.get("/api/health", (_req, res) => {
  const quota = getOddsApiQuota();
  const health: HealthStatus = {
    status: "ok",
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
    apis: {
      footballData: "ok",
      sofascore: "ok",
      theOddsApi: {
        status: "ok",
        requestsRemaining: quota.requestsRemaining ?? undefined,
        requestsUsed: quota.requestsUsed ?? undefined,
      },
    },
    cacheSize: cache.size(),
  };
  res.json(health);
});

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: "Not found", timestamp: new Date().toISOString() });
});

// Error handler
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", err.message);
  res.status(500).json({ error: "Internal server error", timestamp: new Date().toISOString() });
});

// ── Start ─────────────────────────────────────────────────────────────────
app.listen(config.PORT, () => {
  logger.info(`Backend running on http://localhost:${config.PORT}`);
  startRefreshJobs();
});

export default app;
