"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getMevRisk = getMevRisk;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
// Basit in-memory cache (5 sn TTL)
const cache = new Map();
const CACHE_TTL_MS = 5000;
/**
 * Verilen pool adresinde aktif MEV/sandwich bot aktivitesini tespit eder.
 * Helius getSignaturesForAddress + transaction analizi kullanır.
 */
async function getMevRisk(poolAddress) {
    const cached = cache.get(poolAddress);
    if (cached && Date.now() < cached.expiry)
        return cached.data;
    try {
        const url = `https://mainnet.helius-rpc.com/?api-key=${config_1.config.heliusApiKey}`;
        const resp = await axios_1.default.post(url, {
            jsonrpc: "2.0",
            id: 1,
            method: "getSignaturesForAddress",
            params: [poolAddress, { limit: 50 }],
        }, { timeout: 5000 });
        const sigs = resp.data?.result || [];
        const cutoff = Date.now() / 1000 - 30; // son 30 saniye
        // Hızlı art arda gelen (< 2 slot farkı) tx'leri sandwich adayı say
        const recentSigs = sigs.filter((s) => s.blockTime && s.blockTime > cutoff);
        let sandwichCount = 0;
        for (let i = 0; i < recentSigs.length - 1; i++) {
            const slotDiff = Math.abs((recentSigs[i].slot || 0) - (recentSigs[i + 1].slot || 0));
            if (slotDiff <= 1)
                sandwichCount++;
        }
        const activeBotCount = Math.min(sandwichCount, 10);
        const riskLevel = sandwichCount >= 5 ? "high" :
            sandwichCount >= 2 ? "medium" : "low";
        // Tahmini kayıp: sandwich başına ortalama 0.003 SOL
        const estimatedLossLamports = sandwichCount * 3000000;
        const result = {
            pool: poolAddress,
            riskLevel,
            activeBotCount,
            sandwichCount,
            estimatedLossLamports,
            checkedAt: Date.now(),
        };
        cache.set(poolAddress, { data: result, expiry: Date.now() + CACHE_TTL_MS });
        return result;
    }
    catch (err) {
        logger_1.logger.warn("MEV risk check başarısız", { pool: poolAddress, error: err.message });
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
