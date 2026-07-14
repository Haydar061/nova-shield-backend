"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const mev_service_1 = require("../services/mev.service");
const router = (0, express_1.Router)();
router.get("/risk", async (req, res) => {
    const pool = req.query.pool;
    if (!pool) {
        res.status(400).json({ error: "pool parametresi gerekli" });
        return;
    }
    const result = await (0, mev_service_1.getMevRisk)(pool);
    res.json({ success: true, data: result });
});
exports.default = router;
