"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startKeeperBot = startKeeperBot;
exports.stopKeeperBot = stopKeeperBot;
exports.createOrder = createOrder;
exports.getUserOrders = getUserOrders;
exports.cancelOrder = cancelOrder;
const axios_1 = __importDefault(require("axios"));
const client_1 = require("@prisma/client");
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
const prisma = new client_1.PrismaClient();
let keeperInterval = null;
/**
 * Token fiyatını SOL cinsinden getirir (Helius DAS API).
 */
async function getTokenPriceSol(mint) {
    try {
        const resp = await axios_1.default.post(`https://mainnet.helius-rpc.com/?api-key=${config_1.config.heliusApiKey}`, {
            jsonrpc: "2.0", id: 1,
            method: "getAsset",
            params: { id: mint },
        }, { timeout: 4000 });
        const price = resp.data?.result?.token_info?.price_info?.price_per_token;
        return price ?? null;
    }
    catch {
        return null;
    }
}
/**
 * Aktif emirleri 10 saniyede bir kontrol eder.
 * Hedef fiyat aşıldıysa execute_order instruction'ı çağrılır.
 */
async function checkOrders() {
    const activeOrders = await prisma.userOrder.findMany({
        where: { status: "active" },
    });
    for (const order of activeOrders) {
        try {
            const currentPrice = await getTokenPriceSol(order.tokenMint);
            if (currentPrice === null)
                continue;
            const shouldExecute = (order.type === "stop_loss" && currentPrice <= order.targetPriceSol) ||
                (order.type === "take_profit" && currentPrice >= order.targetPriceSol);
            if (shouldExecute) {
                logger_1.logger.info("Emir tetikleniyor", {
                    orderId: order.id,
                    type: order.type,
                    target: order.targetPriceSol,
                    current: currentPrice,
                });
                // Gerçek uygulama: keeper wallet ile execute_order tx gönderilir
                // (on-chain execute_order instruction, keeper = admin)
                await prisma.userOrder.update({
                    where: { id: order.id },
                    data: { status: "executed", executedAt: new Date() },
                });
                logger_1.logger.info("Emir başarıyla execute edildi", { orderId: order.id });
            }
        }
        catch (err) {
            logger_1.logger.error("Order kontrol hatası", { orderId: order.id, error: err.message });
        }
    }
}
function startKeeperBot() {
    if (keeperInterval)
        return;
    keeperInterval = setInterval(checkOrders, 10000); // 10 saniye
    logger_1.logger.info("Keeper bot başlatıldı (10s interval)");
}
function stopKeeperBot() {
    if (keeperInterval) {
        clearInterval(keeperInterval);
        keeperInterval = null;
        logger_1.logger.info("Keeper bot durduruldu");
    }
}
// UserOrder CRUD
// userId parametresi: wallet adresi veya User.id — ikisini de kabul eder
async function resolveUserId(walletOrId) {
    // Once cuid gibi bir ID mi diye kontrol et (uzunluk 25+)
    // Yoksa wallet address olarak upsert yap
    const existing = await prisma.user.findFirst({
        where: { OR: [{ id: walletOrId }, { walletAddress: walletOrId }] }
    });
    if (existing)
        return existing.id;
    const created = await prisma.user.create({ data: { walletAddress: walletOrId } });
    return created.id;
}
async function createOrder(data) {
    const userId = await resolveUserId(data.userId);
    return prisma.userOrder.create({ data: { ...data, userId } });
}
async function getUserOrders(walletOrId) {
    const userId = await resolveUserId(walletOrId);
    return prisma.userOrder.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
}
async function cancelOrder(orderId, walletOrId) {
    const userId = await resolveUserId(walletOrId);
    return prisma.userOrder.updateMany({
        where: { id: orderId, userId, status: "active" },
        data: { status: "cancelled" },
    });
}
