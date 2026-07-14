"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pretrade_service_1 = require("../services/pretrade.service");
const router = (0, express_1.Router)();
// GET /api/pre-trade-check?tokenMint=<mint>&userId=<optional>
router.get("/", async (req, res) => {
    const tokenMint = String(req.query.tokenMint ?? "");
    if (!tokenMint || tokenMint.length < 32) {
        res.status(400).json({ error: "tokenMint gerekli (min 32 karakter)" });
        return;
    }
    const report = await (0, pretrade_service_1.getPreTradeReport)(tokenMint, "", 0);
    res.json({ success: true, data: report });
});
// POST /api/pre-trade-check (body: tokenMint, poolAddress, amountLamports)
router.post("/", async (req, res) => {
    const { tokenMint, poolAddress, amountLamports } = req.body;
    if (!tokenMint || tokenMint.length < 32) {
        res.status(400).json({ error: "tokenMint gerekli" });
        return;
    }
    const report = await (0, pretrade_service_1.getPreTradeReport)(tokenMint, poolAddress ?? "", amountLamports ?? 0);
    res.json({ success: true, data: report });
});
exports.default = router;
