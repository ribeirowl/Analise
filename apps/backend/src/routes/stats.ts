import { Router } from "express";
import { getPicksStats, getPicksHistory, getOddsHistory } from "../services/supabase";

const router = Router();

router.get("/picks", async (_req, res) => {
  try {
    const stats = await getPicksStats();
    res.json({ data: stats, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/history", async (req, res) => {
  try {
    const limit = Math.min(Number(req.query.limit ?? 50), 200);
    const history = await getPicksHistory(limit);
    res.json({ data: history, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/odds/:matchId", async (req, res) => {
  try {
    const history = await getOddsHistory(req.params.matchId);
    res.json({ data: history, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
