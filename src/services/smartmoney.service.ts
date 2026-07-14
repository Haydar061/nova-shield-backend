import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { WebSocket, WebSocketServer } from "ws";
import { config } from "../utils/config";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

// WebSocket broadcast için client listesi
const wsClients = new Set<WebSocket>();

export function registerWsClient(ws: WebSocket) {
  wsClients.add(ws);
  ws.on("close", () => wsClients.delete(ws));
}

function broadcast(data: object) {
  const msg = JSON.stringify(data);
  wsClients.forEach((ws) => {
    if (ws.readyState === WebSocket.OPEN) ws.send(msg);
  });
}

/**
 * Helius webhook payload'ını parse ederek smart money event'i kaydeder.
 * POST /api/webhook/helius endpoint'inden çağrılır.
 */
export async function processHeliusWebhook(transactions: any[]) {
  for (const tx of transactions) {
    try {
      const accountKeys: string[] = tx?.accountData?.map((a: any) => a.account) || [];
      const tokenTransfers: any[] = tx?.tokenTransfers || [];
      const nativeTransfers: any[] = tx?.nativeTransfers || [];

      for (const transfer of tokenTransfers) {
        const fromWallet: string = transfer.fromUserAccount || "";
        const toWallet: string   = transfer.toUserAccount || "";
        const mint: string        = transfer.mint || "";
        const amount: number      = transfer.tokenAmount || 0;

        // Bilinen smart money mi?
        const smartWallet = await prisma.smartMoneyWallet.findUnique({
          where: { address: fromWallet, active: true },
        }) || await prisma.smartMoneyWallet.findUnique({
          where: { address: toWallet, active: true },
        });

        if (!smartWallet) continue;

        const eventType = fromWallet === smartWallet.address ? "sell" : "buy";
        const walletAddress = smartWallet.address;

        // TX zaten kayıtlı mı?
        const existing = await prisma.smartMoneyEvent.findUnique({
          where: { txSig: tx.signature },
        }).catch(() => null);
        if (existing) continue;

        const event = await prisma.smartMoneyEvent.create({
          data: {
            wallet:    walletAddress,
            tokenMint: mint,
            amount,
            usdValue:  0,
            type:      eventType,
            txSig:     tx.signature,
          },
        });

        logger.info("Smart money event tespit edildi", {
          wallet: walletAddress.slice(0, 8) + "...",
          mint: mint.slice(0, 8) + "...",
          type: eventType,
          amount,
        });

        // Frontend'e anlık bildir
        broadcast({
          type:      "smart_money_event",
          wallet:    walletAddress,
          tokenMint: mint,
          eventType,
          amount,
          txSig:     tx.signature,
          timestamp: Date.now(),
        });
      }
    } catch (err: any) {
      logger.error("Webhook parse hatası", { error: err.message });
    }
  }
}

/**
 * Son smart money eventlerini döndürür.
 */
export async function getRecentEvents(limit = 50, since?: number) {
  const where = since ? { timestamp: { gte: new Date(since) } } : {};
  return prisma.smartMoneyEvent.findMany({
    where,
    orderBy: { timestamp: "desc" },
    take: limit,
    include: { smartMoneyWallet: { select: { winRate: true, totalPnl: true } } },
  });
}

/**
 * İzlenecek smart money cüzdan listesini döndürür.
 */
export async function getTrackedWallets() {
  return prisma.smartMoneyWallet.findMany({
    where: { active: true },
    orderBy: { winRate: "desc" },
  });
}

/**
 * Yeni smart money cüzdanı ekler.
 */
export async function addSmartMoneyWallet(address: string, winRate = 0, totalPnl = 0) {
  return prisma.smartMoneyWallet.upsert({
    where: { address },
    create: { address, winRate, totalPnl },
    update: { winRate, totalPnl, active: true },
  });
}
