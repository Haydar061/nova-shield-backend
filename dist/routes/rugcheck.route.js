"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const rugcheck_service_1 = require("../services/rugcheck.service");
const router = (0, express_1.Router)();
router.get("/", async (req, res) => {
    const mint = req.query.mint;
    if (!mint) {
        res.status(400).json({ error: "mint parametresi gerekli" });
        return;
    }
    const result = await (0, rugcheck_service_1.getTokenRisk)(mint);
    res.json({ success: true, data: result });
});
exports.default = router;
