"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.rateLimiter = void 0;
exports.requireWalletAuth = requireWalletAuth;
exports.validate = validate;
exports.requireWebhookSecret = requireWebhookSecret;
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const web3_js_1 = require("@solana/web3.js");
const tweetnacl_1 = __importDefault(require("tweetnacl"));
const bs58_1 = __importDefault(require("bs58"));
// Rate limiter: IP başına 100 istek/dakika
exports.rateLimiter = (0, express_rate_limit_1.default)({
    windowMs: 60000,
    max: 100,
    message: { error: "Çok fazla istek. 1 dakika sonra tekrar deneyin." },
    standardHeaders: true,
    legacyHeaders: false,
});
// Wallet imza doğrulaması
// Header: x-wallet-address, x-signature, x-message
function requireWalletAuth(req, res, next) {
    const walletAddress = req.headers["x-wallet-address"];
    const signature = req.headers["x-signature"];
    const message = req.headers["x-message"];
    if (!walletAddress || !signature || !message) {
        res.status(401).json({ error: "Cüzdan doğrulaması gerekli" });
        return;
    }
    try {
        const publicKey = new web3_js_1.PublicKey(walletAddress);
        const msgBytes = Buffer.from(message, "utf-8");
        const sigBytes = bs58_1.default.decode(signature);
        const valid = tweetnacl_1.default.sign.detached.verify(msgBytes, sigBytes, publicKey.toBytes());
        if (!valid) {
            res.status(401).json({ error: "Geçersiz imza" });
            return;
        }
        req.walletAddress = walletAddress;
        next();
    }
    catch {
        res.status(401).json({ error: "İmza doğrulanamadı" });
    }
}
// Input validation middleware factory
function validate(schema) {
    return (req, res, next) => {
        const result = schema.safeParse(req.body);
        if (!result.success) {
            res.status(400).json({ error: "Geçersiz giriş", details: result.error.flatten() });
            return;
        }
        req.body = result.data;
        next();
    };
}
// Webhook secret doğrulaması (Helius)
function requireWebhookSecret(req, res, next) {
    const secret = req.headers["authorization"];
    if (secret !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
        res.status(401).json({ error: "Yetkisiz webhook" });
        return;
    }
    next();
}
