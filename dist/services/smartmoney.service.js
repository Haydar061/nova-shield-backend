"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerWsClient = registerWsClient;
exports.processHeliusWebhook = processHeliusWebhook;
exports.getRecentEvents = getRecentEvents;
exports.getTrackedWallets = getTrackedWallets;
exports.addSmartMoneyWallet = addSmartMoneyWallet;
const client_1 = require("@prisma/client");
const ws_1 = require("ws");
const logger_1 = require("../utils/logger");
const prisma = new client_1.PrismaClient();
// WebSocket broadcast için client listesi
const wsClients = new Set();
function registerWsClient(ws) {
    wsClients.add(ws);
    ws.on("close", () => wsClients.delete(ws));
}
function broadcast(data) {
    const msg = JSON.stringify(data);
    wsClients.forEach((ws) => {
        if (ws.readyState === ws_1.WebSocket.OPEN)
            ws.send(msg);
    });
}
/**
 * Helius webhook payload'ını parse ederek smart money event'i kaydeder.
 * POST /api/webhook/helius endpoint'inden çağrılır.
 */
async function processHeliusWebhook(transactions) {
    for (const tx of transactions) {
        try {
            const accountKeys = tx?.accountData?.map((a) => a.account) || [];
            const tokenTransfers = tx?.tokenTransfers || [];
            const nativeTransfers = tx?.nativeTransfers || [];
            for (const transfer of tokenTransfers) {
                const fromWallet = transfer.fromUserAccount || "";
                const toWallet = transfer.toUserAccount || "";
                const mint = transfer.mint || "";
                const amount = transfer.tokenAmount || 0;
                // Bilinen smart money mi?
                const smartWallet = await prisma.smartMoneyWallet.findUnique({
                    where: { address: fromWallet, active: true },
                }) || await prisma.smartMoneyWallet.findUnique({
                    where: { address: toWallet, active: true },
                });
                if (!smartWallet)
                    continue;
                const eventType = fromWallet === smartWallet.address ? "sell" : "buy";
                const walletAddress = smartWallet.address;
                // TX zaten kayıtlı mı?
                const existing = await prisma.smartMoneyEvent.findUnique({
                    where: { txSig: tx.signature },
                }).catch(() => null);
                if (existing)
                    continue;
                const event = await prisma.smartMoneyEvent.create({
                    data: {
                        wallet: walletAddress,
                        tokenMint: mint,
                        amount,
                        usdValue: 0,
                        type: eventType,
                        txSig: tx.signature,
                    },
                });
                logger_1.logger.info("Smart money event tespit edildi", {
                    wallet: walletAddress.slice(0, 8) + "...",
                    mint: mint.slice(0, 8) + "...",
                    type: eventType,
                    amount,
                });
                // Frontend'e anlık bildir
                broadcast({
                    type: "smart_money_event",
                    wallet: walletAddress,
                    tokenMint: mint,
                    eventType,
                    amount,
                    txSig: tx.signature,
                    timestamp: Date.now(),
                });
            }
        }
        catch (err) {
            logger_1.logger.error("Webhook parse hatası", { error: err.message });
        }
    }
}
/**
 * Son smart money eventlerini döndürür.
 */
async function getRecentEvents(limit = 50, since) {
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
async function getTrackedWallets() {
    return prisma.smartMoneyWallet.findMany({
        where: { active: true },
        orderBy: { winRate: "desc" },
    });
}
/**
 * Yeni smart money cüzdanı ekler.
 */
async function addSmartMoneyWallet(address, winRate = 0, totalPnl = 0) {
    return prisma.smartMoneyWallet.upsert({
        where: { address },
        create: { address, winRate, totalPnl },
        update: { winRate, totalPnl, active: true },
    });
}
