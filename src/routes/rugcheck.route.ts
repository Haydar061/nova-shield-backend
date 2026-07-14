import { Router, Request, Response } from "express";
import { getTokenRisk } from "../services/rugcheck.service";

const router = Router();

router.get("/", async (req: Request, res: Response) => {
  const mint = req.query.mint as string;
  if (!mint) { res.status(400).json({ error: "mint parametresi gerekli" }); return; }
  const result = await getTokenRisk(mint);
  res.json({ success: true, data: result });
});

export default router;
