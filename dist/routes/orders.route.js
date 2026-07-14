"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const security_1 = require("../middleware/security");
const keeper_service_1 = require("../services/keeper.service");
const router = (0, express_1.Router)();
const createSchema = zod_1.z.object({
    userId: zod_1.z.string(),
    tokenMint: zod_1.z.string().min(32).max(44),
    tokenSymbol: zod_1.z.string().optional(),
    amount: zod_1.z.number().positive(),
    targetPriceSol: zod_1.z.number().positive(),
    type: zod_1.z.enum(["stop_loss", "take_profit"]),
    onChainOrderId: zod_1.z.number().int().positive(),
});
router.post("/", (0, security_1.validate)(createSchema), async (req, res) => {
    const order = await (0, keeper_service_1.createOrder)(req.body);
    res.status(201).json({ success: true, data: order });
});
router.get("/:userId", async (req, res) => {
    const orders = await (0, keeper_service_1.getUserOrders)(String(req.params.userId));
    res.json({ success: true, data: orders });
});
router.delete("/:orderId", async (req, res) => {
    const userId = String(req.query.userId || "");
    if (!userId) {
        res.status(400).json({ error: "userId gerekli" });
        return;
    }
    await (0, keeper_service_1.cancelOrder)(String(req.params.orderId), userId);
    res.json({ success: true });
});
exports.default = router;
