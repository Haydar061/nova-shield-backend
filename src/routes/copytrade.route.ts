import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/security";
import { registerCopyTrade, toggleCopyTrade, getUserCopyTrades } from "../services/copytrade.service";

const router = Router();

const registerSchema = z.object({
  userId:             z.string(),
  masterWallet:       z.string().min(32).max(44),
  spendLimitLamports: z.number().positive(),
});

router.post("/", validate(registerSchema), async (req: Request, res: Response) => {
  const copy = await registerCopyTrade(req.body);
  res.status(201).json({ success: true, data: copy });
});

router.patch("/:id/toggle", async (req: Request, res: Response) => {
  const uid = String(req.query.userId || "");
  if (!uid) { res.status(400).json({ error: "userId gerekli" }); return; }
  const copy = await toggleCopyTrade(String(req.params.id), uid);
  res.json({ success: true, data: copy });
});

router.get("/:userId", async (req: Request, res: Response) => {
  const copies = await getUserCopyTrades(String(req.params.userId));
  res.json({ success: true, data: copies });
});

export default router;
