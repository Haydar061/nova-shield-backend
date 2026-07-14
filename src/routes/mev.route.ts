import { Router, Request, Response } from "express";
import { getMevRisk } from "../services/mev.service";

const router = Router();

router.get("/risk", async (req: Request, res: Response) => {
  const pool = req.query.pool as string;
  if (!pool) { res.status(400).json({ error: "pool parametresi gerekli" }); return; }
  const result = await getMevRisk(pool);
  res.json({ success: true, data: result });
});

export default router;
