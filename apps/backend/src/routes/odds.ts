import { Router } from "express";
import { getEnrichedMatch } from "../aggregator/matches";

const router = Router();

router.get("/match/:id", async (req, res) => {
  try {
    const match = await getEnrichedMatch(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found", timestamp: new Date().toISOString() });
    res.json({ data: match.odds, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
});

export default router;
