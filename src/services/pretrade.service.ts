import { getMevRisk } from "./mev.service";
import { getTokenRisk } from "./rugcheck.service";
import { getRecentEvents } from "./smartmoney.service";
import { logger } from "../utils/logger";

export interface PreTradeReport {
  tokenMint:             string;
  amountLamports:        number;
  mevRisk: {
    level:               string;
    activeBotCount:      number;
    estimatedLossSol:    number;
  };
  smartMoney: {
    activityLast60s:     number;  // son 60 sn kaç smart money hareketi
    recentEvents:        Array<{ wallet: string; type: string; amount: number }>;
  };
  security: {
    score:               number;
    category:            string;
    risks:               string[];
  };
  savings: {
    estimatedLossWithoutSol: number;
    estimatedSavingsSol:     number;
  };
  recommendation:        "safe" | "caution" | "danger";
  generatedAt:           number;
}

export async function getPreTradeReport(
  tokenMint: string,
  poolAddress: string,
  amountLamports: number
): Promise<PreTradeReport> {
  const start = Date.now();

  // Paralel sorgular (hız kritik: < 800ms)
  const [mevResult, rugResult, recentEvents] = await Promise.all([
    getMevRisk(poolAddress),
    getTokenRisk(tokenMint),
    getRecentEvents(10, Date.now() - 60_000), // son 60 sn
  ]);

  const elapsed = Date.now() - start;
  if (elapsed > 800) {
    logger.warn("Pre-trade rapor 800ms limitini aştı", { elapsed, tokenMint });
  }

  // Smart money aktivitesi (son 60 sn)
  const relevantEvents = recentEvents
    .filter((e) => e.tokenMint === tokenMint)
    .map((e) => ({ wallet: e.wallet.slice(0, 8) + "...", type: e.type, amount: e.amount }));

  // Tahmini tasarruf
  const estimatedLossSol = mevResult.estimatedLossLamports / 1e9;
  const estimatedSavings = mevResult.riskLevel !== "low" ? estimatedLossSol : 0;

  // Genel öneri
  let recommendation: "safe" | "caution" | "danger";
  if (rugResult.category === "danger" || mevResult.riskLevel === "high") {
    recommendation = "danger";
  } else if (rugResult.category === "warning" || mevResult.riskLevel === "medium") {
    recommendation = "caution";
  } else {
    recommendation = "safe";
  }

  return {
    tokenMint,
    amountLamports,
    mevRisk: {
      level:            mevResult.riskLevel,
      activeBotCount:   mevResult.activeBotCount,
      estimatedLossSol,
    },
    smartMoney: {
      activityLast60s:  recentEvents.filter((e) => e.tokenMint === tokenMint).length,
      recentEvents:     relevantEvents,
    },
    security: {
      score:    rugResult.score,
      category: rugResult.category,
      risks:    rugResult.risks,
    },
    savings: {
      estimatedLossWithoutSol: estimatedLossSol,
      estimatedSavingsSol:     estimatedSavings,
    },
    recommendation,
    generatedAt: Date.now(),
  };
}
