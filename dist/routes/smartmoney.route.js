"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const smartmoney_service_1 = require("../services/smartmoney.service");
const security_1 = require("../middleware/security");
const router = (0, express_1.Router)();
// Son smart money eventleri
router.get("/recent", async (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const since = req.query.since ? parseInt(req.query.since) : undefined;
    const events = await (0, smartmoney_service_1.getRecentEvents)(limit, since);
    res.json({ success: true, data: events });
});
// İzlenen cüzdanlar
router.get("/wallets", async (_req, res) => {
    const wallets = await (0, smartmoney_service_1.getTrackedWallets)();
    res.json({ success: true, data: wallets });
});
// Yeni cüzdan ekle (admin)
router.post("/wallets", async (req, res) => {
    const { address, winRate, totalPnl } = req.body;
    if (!address) {
        res.status(400).json({ error: "address gerekli" });
        return;
    }
    const wallet = await (0, smartmoney_service_1.addSmartMoneyWallet)(address, winRate, totalPnl);
    res.json({ success: true, data: wallet });
});
// Helius webhook endpoint
router.post("/webhook", security_1.requireWebhookSecret, async (req, res) => {
    const transactions = Array.isArray(req.body) ? req.body : [req.body];
    await (0, smartmoney_service_1.processHeliusWebhook)(transactions);
    res.json({ success: true });
});
exports.default = router;
