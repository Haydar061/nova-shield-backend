"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const security_1 = require("../middleware/security");
const jito_service_1 = require("../services/jito.service");
const router = (0, express_1.Router)();
const submitSchema = zod_1.z.object({
    signedTxBase64: zod_1.z.string().min(1),
    tipLamports: zod_1.z.number().positive().optional(),
});
// MEV korumalı transaction gönder
router.post("/submit", (0, security_1.validate)(submitSchema), async (req, res) => {
    const { signedTxBase64, tipLamports } = req.body;
    const result = await (0, jito_service_1.submitProtectedBundle)(signedTxBase64, tipLamports);
    if (result.status === "rejected") {
        res.status(500).json({ success: false, error: result.error });
        return;
    }
    res.json({ success: true, data: result });
});
// Önerilen tip miktarını getir
router.get("/tip", async (_req, res) => {
    const tip = await (0, jito_service_1.getOptimalTipLamports)();
    res.json({ success: true, data: { tipLamports: tip } });
});
exports.default = router;
