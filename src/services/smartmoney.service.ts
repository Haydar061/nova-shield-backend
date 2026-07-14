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
 * Helius Enhanced Transactions API'dan son işlemleri çeker.
 * DB yoksa veya boşsa gerçek on-chain verileri fallback olarak gösterir.
 */
async function fetchHeliusSmartMoneyEvents(walletAddress: string, limit = 10): Promise<any[]> {
  try {
    const resp = await axios.get(
      `https://api.helius.xyz/v0/addresses/${walletAddress}/transactions`,
      {
        params: { "api-key": config.heliusApiKey, limit, type: "SWAP" },
        timeout: 6_000,
      }
    );
    return (resp.data || []).map((tx: any) => {
      const transfer = tx.tokenTransfers?.[0];
      return {
        id:        tx.signature,
        wallet:    walletAddress,
        tokenMint: transfer?.mint || "unknown",
        tokenName: tx.description?.match(/swapped .+ for (.+)/i)?.[1] || null,
        amount:    transfer?.tokenAmount || 0,
        usdValue:  tx.nativeTransfers?.[0]?.amount / 1e9 || 0,
        type:      tx.type === "SWAP" ? "buy" : "sell",
        txSig:     tx.signature,
        timestamp: new Date(tx.timestamp * 1000),
        smartMoneyWallet: null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Son smart money eventlerini döndürür.
 * Önce DB'yi dener, yoksa Helius'dan canlı çeker.
 */
export async function getRecentEvents(limit = 50, since?: number): Promise<any[]> {
  try {
    const where = since ? { timestamp: { gte: new Date(since) } } : {};
    const dbEvents = await prisma.smartMoneyEvent.findMany({
      where,
      orderBy: { timestamp: "desc" },
      take: limit,
      include: { smartMoneyWallet: { select: { winRate: true, totalPnl: true } } },
    });
    if (dbEvents.length > 0) return dbEvents;
  } catch { /* DB yok, fallback */ }

  // Fallback: bilinen cüzdanlardan birinin gerçek verisi
  const fallbackWallet = "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM";
  return fetchHeliusSmartMoneyEvents(fallbackWallet, Math.min(limit, 20));
}

/**
 * İzlenecek smart money cüzdan listesini döndürür.
 */
export async function getTrackedWallets(): Promise<any[]> {
  try {
    return await prisma.smartMoneyWallet.findMany({
      where: { active: true },
      orderBy: { winRate: "desc" },
    });
  } catch {
    // DB yoksa sabit liste
    return [
      { id:"1", address:"9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM", winRate:0.87, totalPnl:1240000, tradeCount:342, active:true },
      { id:"2", address:"DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWgScfQ", winRate:0.82, totalPnl:890000,  tradeCount:218, active:true },
      { id:"3", address:"HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH", winRate:0.79, totalPnl:2100000, tradeCount:511, active:true },
    ];
  }
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

/**
 * Helius'a program webhook'u kaydet.
 * Backend başladığında çağrılır — zaten kayıtlıysa günceller.
 */
export async function registerHeliusWebhook(backendUrl: string): Promise<void> {
  const WEBHOOK_URL = `${backendUrl}/api/smart-money/webhook`;
  const TRACKED_WALLETS = [
    "9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM",
    "DfXygSm4jCyNCybVYYK6DwvWqjKee8pbDmJGcLWgScfQ",
    "HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH",
    "4Nd1mBQtrMJVYVfKf2PX99kkyu9f8V7UVv7JAUntKDre",
    "GThUX1Atko4tqhN2NaiTazWSeFWMuiUvfFnyJyUghFMJ",
  ];

  try {
    // Mevcut webhook'ları kontrol et
    const listResp = await axios.get(
      `https://api.helius.xyz/v0/webhooks?api-key=${config.heliusApiKey}`,
      { timeout: 5_000 }
    );
    const webhooks: any[] = listResp.data || [];
    const existing = webhooks.find((w: any) => w.webhookURL === WEBHOOK_URL);

    if (existing) {
      // Güncelle
      await axios.put(
        `https://api.helius.xyz/v0/webhooks/${existing.webhookID}?api-key=${config.heliusApiKey}`,
        {
          webhookURL:           WEBHOOK_URL,
          transactionTypes:     ["SWAP", "TOKEN_MINT"],
          accountAddresses:     TRACKED_WALLETS,
          webhookType:          "enhanced",
          authHeader:           config.webhookSecret,
        },
        { timeout: 5_000 }
      );
      logger.info("Helius webhook güncellendi", { id: existing.webhookID });
    } else {
      // Yeni oluştur
      const createResp = await axios.post(
        `https://api.helius.xyz/v0/webhooks?api-key=${config.heliusApiKey}`,
        {
          webhookURL:           WEBHOOK_URL,
          transactionTypes:     ["SWAP", "TOKEN_MINT"],
          accountAddresses:     TRACKED_WALLETS,
          webhookType:          "enhanced",
          authHeader:           config.webhookSecret,
        },
        { timeout: 5_000 }
      );
      logger.info("Helius webhook oluşturuldu", { id: createResp.data?.webhookID });
    }
  } catch (err: any) {
    logger.warn("Helius webhook kayıt başarısız", { error: err.message });
  }
}
