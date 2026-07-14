"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.registerCopyTrade = registerCopyTrade;
exports.toggleCopyTrade = toggleCopyTrade;
exports.getUserCopyTrades = getUserCopyTrades;
exports.recordCopyExecution = recordCopyExecution;
const client_1 = require("@prisma/client");
const logger_1 = require("../utils/logger");
const prisma = new client_1.PrismaClient();
async function resolveUserId(walletOrId) {
    const existing = await prisma.user.findFirst({
        where: { OR: [{ id: walletOrId }, { walletAddress: walletOrId }] }
    });
    if (existing)
        return existing.id;
    const created = await prisma.user.create({ data: { walletAddress: walletOrId } });
    return created.id;
}
async function registerCopyTrade(data) {
    const userId = await resolveUserId(data.userId);
    return prisma.copyTradeSetting.create({ data: { ...data, userId } });
}
async function toggleCopyTrade(id, walletOrId) {
    const userId = await resolveUserId(walletOrId);
    const setting = await prisma.copyTradeSetting.findFirst({ where: { id, userId } });
    if (!setting)
        throw new Error("Copy trade bulunamadı");
    return prisma.copyTradeSetting.update({
        where: { id },
        data: { active: !setting.active },
    });
}
async function getUserCopyTrades(walletOrId) {
    const userId = await resolveUserId(walletOrId);
    return prisma.copyTradeSetting.findMany({
        where: { userId },
        orderBy: { createdAt: "desc" },
    });
}
async function recordCopyExecution(masterWallet, amountSpent) {
    const activeCopies = await prisma.copyTradeSetting.findMany({
        where: { masterWallet, active: true },
    });
    for (const copy of activeCopies) {
        if (amountSpent > copy.spendLimitLamports) {
            logger_1.logger.warn("Copy trade harcama limiti aşıldı, atlanıyor", {
                userId: copy.userId,
                limit: copy.spendLimitLamports,
                amount: amountSpent,
            });
            continue;
        }
        await prisma.copyTradeSetting.update({
            where: { id: copy.id },
            data: { totalCopied: { increment: amountSpent } },
        });
        logger_1.logger.info("Copy trade kopyalandı", {
            follower: copy.userId,
            master: masterWallet.slice(0, 8) + "...",
            amount: amountSpent,
        });
    }
}
