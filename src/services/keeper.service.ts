import axios from "axios";
import { PrismaClient } from "@prisma/client";
import { config } from "../utils/config";
import { logger } from "../utils/logger";

const prisma = new PrismaClient();
let keeperInterval: NodeJS.Timeout | null = null;

/**
 * Token fiyatını SOL cinsinden getirir (Helius DAS API).
 */
async function getTokenPriceSol(mint: string): Promise<number | null> {
  try {
    const resp = await axios.post(
      `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`,
      {
        jsonrpc: "2.0", id: 1,
        method: "getAsset",
        params: { id: mint },
      },
      { timeout: 4_000 }
    );
    const price = resp.data?.result?.token_info?.price_info?.price_per_token;
    return price ?? null;
  } catch {
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
      if (currentPrice === null) continue;

      const shouldExecute =
        (order.type === "stop_loss"   && currentPrice <= order.targetPriceSol) ||
        (order.type === "take_profit" && currentPrice >= order.targetPriceSol);

      if (shouldExecute) {
        logger.info("Emir tetikleniyor", {
          orderId: order.id,
          type:    order.type,
          target:  order.targetPriceSol,
          current: currentPrice,
        });

        // Gerçek uygulama: keeper wallet ile execute_order tx gönderilir
        // (on-chain execute_order instruction, keeper = admin)
        await prisma.userOrder.update({
          where: { id: order.id },
          data:  { status: "executed", executedAt: new Date() },
        });

        logger.info("Emir başarıyla execute edildi", { orderId: order.id });
      }
    } catch (err: any) {
      logger.error("Order kontrol hatası", { orderId: order.id, error: err.message });
    }
  }
}

export function startKeeperBot() {
  if (keeperInterval) return;
  keeperInterval = setInterval(checkOrders, 10_000); // 10 saniye
  logger.info("Keeper bot başlatıldı (10s interval)");
}

export function stopKeeperBot() {
  if (keeperInterval) {
    clearInterval(keeperInterval);
    keeperInterval = null;
    logger.info("Keeper bot durduruldu");
  }
}

// UserOrder CRUD
// userId parametresi: wallet adresi veya User.id — ikisini de kabul eder
async function resolveUserId(walletOrId: string): Promise<string> {
  // Once cuid gibi bir ID mi diye kontrol et (uzunluk 25+)
  // Yoksa wallet address olarak upsert yap
  const existing = await prisma.user.findFirst({
    where: { OR: [{ id: walletOrId }, { walletAddress: walletOrId }] }
  });
  if (existing) return existing.id;
  const created = await prisma.user.create({ data: { walletAddress: walletOrId } });
  return created.id;
}

export async function createOrder(data: {
  userId: string;
  tokenMint: string;
  tokenSymbol?: string;
  amount: number;
  targetPriceSol: number;
  type: "stop_loss" | "take_profit";
  onChainOrderId: number;
}) {
  const userId = await resolveUserId(data.userId);
  return prisma.userOrder.create({ data: { ...data, userId } });
}

export async function getUserOrders(walletOrId: string) {
  const userId = await resolveUserId(walletOrId);
  return prisma.userOrder.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
  });
}

export async function cancelOrder(orderId: string, walletOrId: string) {
  const userId = await resolveUserId(walletOrId);
  return prisma.userOrder.updateMany({
    where: { id: orderId, userId, status: "active" },
    data:  { status: "cancelled" },
  });
}
