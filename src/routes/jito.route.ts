import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/security";
import { submitProtectedBundle, getOptimalTipLamports } from "../services/jito.service";

const router = Router();

const submitSchema = z.object({
  signedTxBase64: z.string().min(1),
  tipLamports:    z.number().positive().optional(),
});

// MEV korumalı transaction gönder
router.post("/submit", validate(submitSchema), async (req: Request, res: Response) => {
  const { signedTxBase64, tipLamports } = req.body;
  const result = await submitProtectedBundle(signedTxBase64, tipLamports);
  if (result.status === "rejected") {
    res.status(500).json({ success: false, error: result.error });
    return;
  }
  res.json({ success: true, data: result });
});

// Önerilen tip miktarını getir
router.get("/tip", async (_req: Request, res: Response) => {
  const tip = await getOptimalTipLamports();
  res.json({ success: true, data: { tipLamports: tip } });
});

export default router;
