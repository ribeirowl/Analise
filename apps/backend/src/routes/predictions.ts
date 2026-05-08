import { Router } from "express";
import { getEnrichedMatch, getH2HSummary } from "../aggregator/matches";
import { getPrediction, getInjuries } from "../services/apiFootball";

const router = Router();

router.get("/match/:id/h2h", async (req, res) => {
  try {
    const match = await getEnrichedMatch(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });
    const h2h = await getH2HSummary(match.homeTeam.id, match.awayTeam.id);
    res.json({ data: h2h, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/match/:id/predictions", async (req, res) => {
  try {
    const match = await getEnrichedMatch(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });
    const fixtureId = match.id.startsWith("af_") ? Number(match.id.replace("af_", "")) : null;
    const afPred = fixtureId ? await getPrediction(fixtureId) : null;
    res.json({
      data: {
        apiFootball: afPred,
        ourModel: {
          homeWin: match.valuePicks.find((p) => p.market === "home_win")?.estimatedProbability,
          draw: match.valuePicks.find((p) => p.market === "draw")?.estimatedProbability,
          awayWin: match.valuePicks.find((p) => p.market === "away_win")?.estimatedProbability,
        },
        valuePicks: match.valuePicks,
      },
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

router.get("/match/:id/injuries", async (req, res) => {
  try {
    const match = await getEnrichedMatch(req.params.id);
    if (!match) return res.status(404).json({ error: "Match not found" });
    const fixtureId = match.id.startsWith("af_") ? Number(match.id.replace("af_", "")) : null;
    const injuries = fixtureId ? await getInjuries(fixtureId) : [];
    res.json({ data: injuries, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});

export default router;
