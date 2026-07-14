"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getTokenRisk = getTokenRisk;
const axios_1 = __importDefault(require("axios"));
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
// 5 dakika cache
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000;
async function getTokenRisk(mint) {
    const cached = cache.get(mint);
    if (cached && Date.now() < cached.expiry)
        return cached.data;
    try {
        const resp = await axios_1.default.get(`${config_1.config.rugcheckBaseUrl}/tokens/${mint}/report/summary`, { timeout: 5000 });
        const data = resp.data;
        const score = data?.score ?? 50;
        const risks = (data?.risks || []).map((r) => r.name || r);
        const tokenName = data?.tokenMeta?.name;
        const category = score >= 70 ? "good" :
            score >= 40 ? "warning" : "danger";
        const result = {
            mint,
            score,
            category,
            risks,
            tokenName,
            checkedAt: Date.now(),
        };
        cache.set(mint, { data: result, expiry: Date.now() + CACHE_TTL_MS });
        return result;
    }
    catch (err) {
        logger_1.logger.warn("RugCheck API hatası", { mint, error: err.message });
        // API erişilemezse nötr sonuç döndür
        return {
            mint, score: 50, category: "warning",
            risks: ["RugCheck API erişilemiyor"],
            checkedAt: Date.now(),
        };
    }
}
