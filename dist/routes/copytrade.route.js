"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const security_1 = require("../middleware/security");
const copytrade_service_1 = require("../services/copytrade.service");
const router = (0, express_1.Router)();
const registerSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    masterWallet: zod_1.z.string().min(32).max(44),
    spendLimitLamports: zod_1.z.number().positive(),
});
router.post("/", (0, security_1.validate)(registerSchema), async (req, res) => {
    const copy = await (0, copytrade_service_1.registerCopyTrade)(req.body);
    res.status(201).json({ success: true, data: copy });
});
router.patch("/:id/toggle", async (req, res) => {
    const uid = String(req.query.userId || "");
    if (!uid) {
        res.status(400).json({ error: "userId gerekli" });
        return;
    }
    const copy = await (0, copytrade_service_1.toggleCopyTrade)(String(req.params.id), uid);
    res.json({ success: true, data: copy });
});
router.get("/:userId", async (req, res) => {
    const copies = await (0, copytrade_service_1.getUserCopyTrades)(String(req.params.userId));
    res.json({ success: true, data: copies });
});
exports.default = router;
