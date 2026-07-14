import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();

async function resolveUserId(walletOrId: string): Promise<string> {
  const existing = await prisma.user.findFirst({
    where: { OR: [{ id: walletOrId }, { walletAddress: walletOrId }] }
  });
  if (existing) return existing.id;
  const created = await prisma.user.create({ data: { walletAddress: walletOrId } });
  return created.id;
}

export async function registerCopyTrade(data: {
  userId: string;
  masterWallet: string;
  spendLimitLamports: number;
}) {
  const userId = await resolveUserId(data.userId);
  return prisma.copyTradeSetting.create({ data: { ...data, userId } });
}

export async function toggleCopyTrade(id: string, walletOrId: string) {
  const userId = await resolveUserId(walletOrId);
  const setting = await prisma.copyTradeSetting.findFirst({ where: { id, userId } });
  if (!setting) throw new Error("Copy trade bulunamadı");
  return prisma.copyTradeSetting.update({
    where: { id },
    data:  { active: !setting.active },
  });
}

export async function getUserCopyTrades(walletOrId: string) {
  const userId = await resolveUserId(walletOrId);
  return prisma.copyTradeSetting.findMany({
    where:   { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function recordCopyExecution(masterWallet: string, amountSpent: number) {
  const activeCopies = await prisma.copyTradeSetting.findMany({
    where: { masterWallet, active: true },
  });

  for (const copy of activeCopies) {
    if (amountSpent > copy.spendLimitLamports) {
      logger.warn("Copy trade harcama limiti aşıldı, atlanıyor", {
        userId: copy.userId,
        limit:  copy.spendLimitLamports,
        amount: amountSpent,
      });
      continue;
    }

    await prisma.copyTradeSetting.update({
      where: { id: copy.id },
      data:  { totalCopied: { increment: amountSpent } },
    });

    logger.info("Copy trade kopyalandı", {
      follower: copy.userId,
      master:   masterWallet.slice(0, 8) + "...",
      amount:   amountSpent,
    });
  }
}
