/**
 * Vercel Cron Job endpoint'leri.
 * vercel.json'da schedule ile çalıştırılır.
 * Her endpoint sadece CRON_SECRET ile erişilebilir.
 */
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import axios from "axios";
import { config } from "../utils/config";
import { logger } from "../utils/logger";

const router = Router();

function authCron(req: Request, res: Response): boolean {
  const auth = req.headers.authorization;
  const secret = process.env.CRON_SECRET || config.webhookSecret;
  if (auth !== `Bearer ${secret}`) {
    res.status(401).json({ error: "Yetkisiz" });
    return false;
  }
  return true;
}

/** Aktif stop-loss / take-profit emirlerini kontrol et */
router.post("/keeper", async (req: Request, res: Response) => {
  if (!authCron(req, res)) return;

  let prisma: PrismaClient | null = null;
  try {
    prisma = new PrismaClient();
    const activeOrders = await prisma.userOrder.findMany({ where: { status: "active" } });
    let executed = 0;

    for (const order of activeOrders) {
      try {
        const priceResp = await axios.post(
          `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`,
          { jsonrpc: "2.0", id: 1, method: "getAsset", params: { id: order.tokenMint } },
          { timeout: 4_000 }
        );
        const price: number | null =
          priceResp.data?.result?.token_info?.price_info?.price_per_token ?? null;

        if (price === null) continue;

        const shouldExecute =
          (order.type === "stop_loss"   && price <= order.targetPriceSol) ||
          (order.type === "take_profit" && price >= order.targetPriceSol);

        if (shouldExecute) {
          await prisma.userOrder.update({
            where: { id: order.id },
            data:  { status: "executed", executedAt: new Date() },
          });
          executed++;
          logger.info("Keeper: emir execute edildi", {
            id: order.id, type: order.type, price, target: order.targetPriceSol,
          });
        }
      } catch (err: any) {
        logger.error("Keeper: order check hatası", { id: order.id, error: err.message });
      }
    }

    res.json({ success: true, checked: activeOrders.length, executed });
  } catch (err: any) {
    logger.error("Keeper cron hatası", { error: err.message });
    res.status(500).json({ error: err.message });
  } finally {
    await prisma?.$disconnect();
  }
});

/** Smart money aktif cüzdanlarını DB'ye ekle (ilk kurulum) */
router.post("/seed-wallets", async (req: Request, res: Response) => {
  if (!authCron(req, res)) return;

  const KNOWN_SMART_WALLETS = [
    { address: "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", winRate: 0.87, totalPnl: 1240000 },
    { address: "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWgScfQ", winRate: 0.82, totalPnl: 890000 },
    { address: "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH", winRate: 0.79, totalPnl: 2100000 },
    { address: "4Nd1mBQtrMJVYVfKf2PX99kkyu9f8V7UVv7JAUntKDre", winRate: 0.76, totalPnl: 560000 },
    { address: "GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ", winRate: 0.74, totalPnl: 430000 },
    { address: "CakcnaRDHka2gXyfxNhasbreXnC5rsuSMTiNofRxJrjs", winRate: 0.71, totalPnl: 380000 },
    { address: "8UJgxaiQx5nTrdDgph5FiahMmsd6a3oVkKsGtyFe84B", winRate: 0.69, totalPnl: 290000 },
    { address: "3Katmm9dhvLQijAvomteYMo6rfVbH5EKZn3zq3A6XWFM", winRate: 0.68, totalPnl: 210000 },
  ];

  let prisma: PrismaClient | null = null;
  try {
    prisma = new PrismaClient();
    let added = 0;
    for (const w of KNOWN_SMART_WALLETS) {
      await prisma.smartMoneyWallet.upsert({
        where:  { address: w.address },
        create: { address: w.address, winRate: w.winRate, totalPnl: w.totalPnl, active: true },
        update: { winRate: w.winRate, totalPnl: w.totalPnl, active: true },
      });
      added++;
    }
    res.json({ success: true, added });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  } finally {
    await prisma?.$disconnect();
  }
});

export default router;
