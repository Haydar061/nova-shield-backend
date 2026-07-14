"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.submitProtectedBundle = submitProtectedBundle;
exports.getOptimalTipLamports = getOptimalTipLamports;
const axios_1 = __importDefault(require("axios"));
const web3_js_1 = require("@solana/web3.js");
const config_1 = require("../utils/config");
const logger_1 = require("../utils/logger");
// Jito tip cüzdanları (mainnet)
const JITO_TIP_ACCOUNTS = [
    "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
    "HFqU5x63VTqvB8eLJSDmfZ7ymKwys9TimVqsGGRWXAt",
    "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
    "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
];
/**
 * İmzalı transaction'ı Jito bundle olarak gönderir (MEV koruması).
 */
async function submitProtectedBundle(signedTxBase64, tipLamports = config_1.config.jitoTipLamports) {
    const connection = new web3_js_1.Connection(config_1.config.rpcUrl, "confirmed");
    // Tip cüzdanını rastgele seç
    const tipAccount = new web3_js_1.PublicKey(JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]);
    // Tip transaction oluştur (sadece simulation için gerekli değil, gerçek submit için gerekli)
    const tipTx = new web3_js_1.Transaction().add(web3_js_1.SystemProgram.transfer({
        fromPubkey: tipAccount, // client-side imzalanacak, placeholder
        toPubkey: tipAccount,
        lamports: tipLamports,
    }));
    const bundlePayload = {
        jsonrpc: "2.0",
        id: 1,
        method: "sendBundle",
        params: [[signedTxBase64]],
    };
    try {
        const endpoint = `${config_1.config.jitoBlockEngine}/api/v1/bundles`;
        const resp = await axios_1.default.post(endpoint, bundlePayload, {
            headers: { "Content-Type": "application/json" },
            timeout: 10000,
        });
        const bundleId = resp.data?.result;
        logger_1.logger.info("Jito bundle gönderildi", { bundleId, tipLamports });
        return { bundleId, status: "accepted" };
    }
    catch (err) {
        const msg = err?.response?.data?.error?.message || err.message;
        logger_1.logger.warn("Jito bundle reddedildi, fallback yapılıyor", { error: msg });
        // Fallback: normal RPC ile gönder
        try {
            const txBuf = Buffer.from(signedTxBase64, "base64");
            const sig = await connection.sendRawTransaction(txBuf, {
                skipPreflight: false,
                maxRetries: 3,
            });
            return { bundleId: sig, status: "accepted" };
        }
        catch (fallbackErr) {
            return { bundleId: "", status: "rejected", error: fallbackErr.message };
        }
    }
}
/**
 * Kullanıcının önerilen Jito tip miktarını hesaplar (son 10 blok bazında).
 */
async function getOptimalTipLamports() {
    try {
        const resp = await axios_1.default.get(`${config_1.config.jitoBlockEngine}/api/v1/bundles/tip_floor`, { timeout: 5000 });
        const floor = resp.data?.landed_tips_75th_percentile ?? 0;
        // Min 5000, max 100000 lamport arası tut
        return Math.min(Math.max(floor, 5000), 100000);
    }
    catch {
        return config_1.config.jitoTipLamports; // default
    }
}
