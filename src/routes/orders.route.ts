import { Router, Request, Response } from "express";
import { z } from "zod";
import { validate } from "../middleware/security";
import { createOrder, getUserOrders, cancelOrder } from "../services/keeper.service";

const router = Router();

const createSchema = z.object({
  userId:         z.string(),
  tokenMint:      z.string().min(32).max(44),
  tokenSymbol:    z.string().optional(),
  amount:         z.number().positive(),
  targetPriceSol: z.number().positive(),
  type:           z.enum(["stop_loss", "take_profit"]),
  onChainOrderId: z.number().int().positive(),
});

router.post("/", validate(createSchema), async (req: Request, res: Response) => {
  const order = await createOrder(req.body);
  res.status(201).json({ success: true, data: order });
});

router.get("/:userId", async (req: Request, res: Response) => {
  const orders = await getUserOrders(String(req.params.userId));
  res.json({ success: true, data: orders });
});

router.delete("/:orderId", async (req: Request, res: Response) => {
  const userId = String(req.query.userId || "");
  if (!userId) { res.status(400).json({ error: "userId gerekli" }); return; }
  await cancelOrder(String(req.params.orderId), userId);
  res.json({ success: true });
});

export default router;
