import { Router, Request, Response } from "express";
import { getPreTradeReport } from "../services/pretrade.service";

const router = Router();

// GET /api/pre-trade-check?tokenMint=<mint>&userId=<optional>
router.get("/", async (req: Request, res: Response) => {
  const tokenMint = String(req.query.tokenMint ?? "");
  if (!tokenMint || tokenMint.length < 32) {
    res.status(400).json({ error: "tokenMint gerekli (min 32 karakter)" });
    return;
  }
  const report = await getPreTradeReport(tokenMint, "", 0);
  res.json({ success: true, data: report });
});

// POST /api/pre-trade-check (body: tokenMint, poolAddress, amountLamports)
router.post("/", async (req: Request, res: Response) => {
  const { tokenMint, poolAddress, amountLamports } = req.body;
  if (!tokenMint || tokenMint.length < 32) {
    res.status(400).json({ error: "tokenMint gerekli" });
    return;
  }
  const report = await getPreTradeReport(tokenMint, poolAddress ?? "", amountLamports ?? 0);
  res.json({ success: true, data: report });
});

export default router;
