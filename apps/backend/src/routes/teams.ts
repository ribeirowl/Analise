import { Router } from "express";
import { getTeam } from "../services/footballData";

const router = Router();

router.get("/:id", async (req, res) => {
  try {
    const team = await getTeam(Number(req.params.id));
    if (!team) return res.status(404).json({ error: "Team not found", timestamp: new Date().toISOString() });
    res.json({ data: team, timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(500).json({ error: String(err), timestamp: new Date().toISOString() });
  }
});

export default router;
