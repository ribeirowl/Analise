import { Router } from "express";
import { getEnrichedTodayMatches, getEnrichedMatch } from "../aggregator/matches";
import type { ApiResponse } from "@analise-futebol/shared";

const router = Router();

router.get("/today", async (req, res) => {
  try {
    const date = req.query.date as string | undefined;
    const matches = await getEnrichedTodayMatches(date);
    const body: ApiResponse<typeof matches> = {
      data: matches,
      cached: false,
      timestamp: new Date().toISOString(),
    };
    res.json(body);
  } catch (err) {
    res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
});

router.get("/:id", async (req, res) => {
  try {
    const match = await getEnrichedMatch(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found", timestamp: new Date().toISOString() });
    res.json({ data: match, cached: false, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
});

export default router;
