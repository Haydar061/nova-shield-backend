import axios from "axios";
import { config } from "../utils/config";
import { logger } from "../utils/logger";

export type RiskCategory = "good" | "warning" | "danger";

export interface TokenRiskResult {
  mint:        string;
  score:       number;        // 0-100 (yüksek = iyi)
  category:    RiskCategory;
  risks:       string[];
  tokenName?:  string;
  checkedAt:   number;
}

// 5 dakika cache
const cache = new Map<string, { data: TokenRiskResult; expiry: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

export async function getTokenRisk(mint: string): Promise<TokenRiskResult> {
  const cached = cache.get(mint);
  if (cached && Date.now() < cached.expiry) return cached.data;

  try {
    const resp = await axios.get(
      `${config.rugcheckBaseUrl}/tokens/${mint}/report/summary`,
      { timeout: 5_000 }
    );

    const data = resp.data;
    const score: number = data?.score ?? 50;
    const risks: string[] = (data?.risks || []).map((r: any) => r.name || r);
    const tokenName: string = data?.tokenMeta?.name;

    const category: RiskCategory =
      score >= 70 ? "good" :
      score >= 40 ? "warning" : "danger";

    const result: TokenRiskResult = {
      mint,
      score,
      category,
      risks,
      tokenName,
      checkedAt: Date.now(),
    };

    cache.set(mint, { data: result, expiry: Date.now() + CACHE_TTL_MS });
    return result;
  } catch (err: any) {
    logger.warn("RugCheck API hatası", { mint, error: err.message });
    // API erişilemezse nötr sonuç döndür
    return {
      mint, score: 50, category: "warning",
      risks: ["RugCheck API erişilemiyor"],
      checkedAt: Date.now(),
    };
  }
}
