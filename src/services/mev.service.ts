import axios from "axios";
import { config } from "../utils/config";
import { logger } from "../utils/logger";

export type MevRiskLevel = "low" | "medium" | "high";

export interface MevRiskResult {
  pool:           string;
  riskLevel:      MevRiskLevel;
  activeBotCount: number;
  sandwichCount:  number;    // son 30 sn sandwich sayısı
  estimatedLossLamports: number;
  checkedAt:      number;
}

// Basit in-memory cache (5 sn TTL)
const cache = new Map<string, { data: MevRiskResult; expiry: number }>();
const CACHE_TTL_MS = 5_000;

/**
 * Verilen pool adresinde aktif MEV/sandwich bot aktivitesini tespit eder.
 * Helius getSignaturesForAddress + transaction analizi kullanır.
 */
export async function getMevRisk(poolAddress: string): Promise<MevRiskResult> {
  const cached = cache.get(poolAddress);
  if (cached && Date.now() < cached.expiry) return cached.data;

  try {
    const url = `https://mainnet.helius-rpc.com/?api-key=${config.heliusApiKey}`;
    const resp = await axios.post(url, {
      jsonrpc: "2.0",
      id: 1,
      method: "getSignaturesForAddress",
      params: [poolAddress, { limit: 50 }],
    }, { timeout: 5_000 });

    const sigs: any[] = resp.data?.result || [];
    const cutoff = Date.now() / 1000 - 30; // son 30 saniye

    // Hızlı art arda gelen (< 2 slot farkı) tx'leri sandwich adayı say
    const recentSigs = sigs.filter((s: any) => s.blockTime && s.blockTime > cutoff);
    let sandwichCount = 0;
    for (let i = 0; i < recentSigs.length - 1; i++) {
      const slotDiff = Math.abs((recentSigs[i].slot || 0) - (recentSigs[i + 1].slot || 0));
      if (slotDiff <= 1) sandwichCount++;
    }

    const activeBotCount = Math.min(sandwichCount, 10);
    const riskLevel: MevRiskLevel =
      sandwichCount >= 5 ? "high" :
      sandwichCount >= 2 ? "medium" : "low";

    // Tahmini kayıp: sandwich başına ortalama 0.003 SOL
    const estimatedLossLamports = sandwichCount * 3_000_000;

    const result: MevRiskResult = {
      pool: poolAddress,
      riskLevel,
      activeBotCount,
      sandwichCount,
      estimatedLossLamports,
      checkedAt: Date.now(),
    };

    cache.set(poolAddress, { data: result, expiry: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err: any) {
    logger.warn("MEV risk check başarısız", { pool: poolAddress, error: err.message });
    return {
      pool: poolAddress,
      riskLevel: "low",
      activeBotCount: 0,
      sandwichCount: 0,
      estimatedLossLamports: 0,
      checkedAt: Date.now(),
    };
  }
}
