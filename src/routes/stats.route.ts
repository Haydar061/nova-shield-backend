import { Router, Request, Response } from "express";
import { getProtocolStats } from "../services/stats.service";

const router = Router();

router.get("/", async (_req: Request, res: Response) => {
  const stats = await getProtocolStats();
  res.json({ success: true, data: stats });
});

export default router;
