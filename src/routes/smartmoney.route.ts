import { Router, Request, Response } from "express";
import { getRecentEvents, getTrackedWallets, addSmartMoneyWallet, processHeliusWebhook } from "../services/smartmoney.service";
import { requireWebhookSecret } from "../middleware/security";

const router = Router();

// Son smart money eventleri
router.get("/recent", async (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 50;
  const since = req.query.since ? parseInt(req.query.since as string) : undefined;
  const events = await getRecentEvents(limit, since);
  res.json({ success: true, data: events });
});

// İzlenen cüzdanlar
router.get("/wallets", async (_req: Request, res: Response) => {
  const wallets = await getTrackedWallets();
  res.json({ success: true, data: wallets });
});

// Yeni cüzdan ekle (admin)
router.post("/wallets", async (req: Request, res: Response) => {
  const { address, winRate, totalPnl } = req.body;
  if (!address) { res.status(400).json({ error: "address gerekli" }); return; }
  const wallet = await addSmartMoneyWallet(address, winRate, totalPnl);
  res.json({ success: true, data: wallet });
});

// Helius webhook endpoint
router.post("/webhook", requireWebhookSecret, async (req: Request, res: Response) => {
  const transactions: any[] = Array.isArray(req.body) ? req.body : [req.body];
  await processHeliusWebhook(transactions);
  res.json({ success: true });
});

export default router;
