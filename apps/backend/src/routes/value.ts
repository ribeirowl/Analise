import { Router } from "express";
import { getEnrichedTodayMatches } from "../aggregator/matches";
import type { ValuePick } from "@analise-futebol/shared";

const router = Router();

router.get("/today", async (req, res) => {
  try {
    const matches = await getEnrichedTodayMatches();
    const allPicks: ValuePick[] = matches
      .flatMap((m) => m.valuePicks)
      .sort((a, b) => b.edge - a.edge);
    res.json({ data: allPicks, count: allPicks.length, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
});

export default router;
