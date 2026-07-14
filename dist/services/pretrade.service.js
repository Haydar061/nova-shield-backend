"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPreTradeReport = getPreTradeReport;
const mev_service_1 = require("./mev.service");
const rugcheck_service_1 = require("./rugcheck.service");
const smartmoney_service_1 = require("./smartmoney.service");
const logger_1 = require("../utils/logger");
async function getPreTradeReport(tokenMint, poolAddress, amountLamports) {
    const start = Date.now();
    // Paralel sorgular (hız kritik: < 800ms)
    const [mevResult, rugResult, recentEvents] = await Promise.all([
        (0, mev_service_1.getMevRisk)(poolAddress),
        (0, rugcheck_service_1.getTokenRisk)(tokenMint),
        (0, smartmoney_service_1.getRecentEvents)(10, Date.now() - 60000), // son 60 sn
    ]);
    const elapsed = Date.now() - start;
    if (elapsed > 800) {
        logger_1.logger.warn("Pre-trade rapor 800ms limitini aştı", { elapsed, tokenMint });
    }
    // Smart money aktivitesi (son 60 sn)
    const relevantEvents = recentEvents
        .filter((e) => e.tokenMint === tokenMint)
        .map((e) => ({ wallet: e.wallet.slice(0, 8) + "...", type: e.type, amount: e.amount }));
    // Tahmini tasarruf
    const estimatedLossSol = mevResult.estimatedLossLamports / 1e9;
    const estimatedSavings = mevResult.riskLevel !== "low" ? estimatedLossSol : 0;
    // Genel öneri
    let recommendation;
    if (rugResult.category === "danger" || mevResult.riskLevel === "high") {
        recommendation = "danger";
    }
    else if (rugResult.category === "warning" || mevResult.riskLevel === "medium") {
        recommendation = "caution";
    }
    else {
        recommendation = "safe";
    }
    return {
        tokenMint,
        amountLamports,
        mevRisk: {
            level: mevResult.riskLevel,
            activeBotCount: mevResult.activeBotCount,
            estimatedLossSol,
        },
        smartMoney: {
            activityLast60s: recentEvents.filter((e) => e.tokenMint === tokenMint).length,
            recentEvents: relevantEvents,
        },
        security: {
            score: rugResult.score,
            category: rugResult.category,
            risks: rugResult.risks,
        },
        savings: {
            estimatedLossWithoutSol: estimatedLossSol,
            estimatedSavingsSol: estimatedSavings,
        },
        recommendation,
        generatedAt: Date.now(),
    };
}
