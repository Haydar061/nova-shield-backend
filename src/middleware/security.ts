import { Request, Response, NextFunction } from "express";
import rateLimit from "express-rate-limit";
import { PublicKey } from "@solana/web3.js";
import nacl from "tweetnacl";
import bs58 from "bs58";
import { z } from "zod";

// Rate limiter: IP başına 100 istek/dakika
export const rateLimiter = rateLimit({
  windowMs: 60_000,
  max:      100,
  message:  { error: "Çok fazla istek. 1 dakika sonra tekrar deneyin." },
  standardHeaders: true,
  legacyHeaders:   false,
});

// Wallet imza doğrulaması
// Header: x-wallet-address, x-signature, x-message
export function requireWalletAuth(req: Request, res: Response, next: NextFunction) {
  const walletAddress = req.headers["x-wallet-address"] as string;
  const signature     = req.headers["x-signature"]     as string;
  const message       = req.headers["x-message"]       as string;

  if (!walletAddress || !signature || !message) {
    res.status(401).json({ error: "Cüzdan doğrulaması gerekli" });
    return;
  }

  try {
    const publicKey = new PublicKey(walletAddress);
    const msgBytes  = Buffer.from(message, "utf-8");
    const sigBytes  = bs58.decode(signature);
    const valid     = nacl.sign.detached.verify(
      msgBytes,
      sigBytes,
      publicKey.toBytes()
    );

    if (!valid) {
      res.status(401).json({ error: "Geçersiz imza" });
      return;
    }

    (req as any).walletAddress = walletAddress;
    next();
  } catch {
    res.status(401).json({ error: "İmza doğrulanamadı" });
  }
}

// Input validation middleware factory
export function validate(schema: z.ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
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
export function requireWebhookSecret(req: Request, res: Response, next: NextFunction) {
  const secret = req.headers["authorization"];
  if (secret !== `Bearer ${process.env.WEBHOOK_SECRET}`) {
    res.status(401).json({ error: "Yetkisiz webhook" });
    return;
  }
  next();
}
