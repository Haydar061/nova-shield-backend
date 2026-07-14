import axios from "axios";
import { Connection, Transaction, PublicKey, SystemProgram, LAMPORTS_PER_SOL } from "@solana/web3.js";
import bs58 from "bs58";
import { config } from "../utils/config";
import { logger } from "../utils/logger";

// Jito tip cüzdanları (mainnet)
const JITO_TIP_ACCOUNTS = [
  "96gYZGLnJYVFmbjzopPSU6QiEV5fGqZNyN9nmNhvrZU5",
  "HFqU5x63VTqvB8eLJSDmfZ7ymKwys9TimVqsGGRWXAt",
  "Cw8CFyM9FkoMi7K7Crf6HNQqf4uEMzpKw6QNghXLvLkY",
  "ADaUMid9yfUytqMBgopwjb2DTLSokTSzL1zt6iGPaS49",
];

export interface BundleResult {
  bundleId: string;
  status:   "accepted" | "rejected";
  error?:   string;
}

/**
 * İmzalı transaction'ı Jito bundle olarak gönderir (MEV koruması).
 */
export async function submitProtectedBundle(
  signedTxBase64: string,
  tipLamports: number = config.jitoTipLamports
): Promise<BundleResult> {
  const connection = new Connection(config.rpcUrl, "confirmed");

  // Tip cüzdanını rastgele seç
  const tipAccount = new PublicKey(
    JITO_TIP_ACCOUNTS[Math.floor(Math.random() * JITO_TIP_ACCOUNTS.length)]
  );

  // Tip transaction oluştur (sadece simulation için gerekli değil, gerçek submit için gerekli)
  const tipTx = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: tipAccount, // client-side imzalanacak, placeholder
      toPubkey:   tipAccount,
      lamports:   tipLamports,
    })
  );

  const bundlePayload = {
    jsonrpc: "2.0",
    id: 1,
    method: "sendBundle",
    params: [[signedTxBase64]],
  };

  try {
    const endpoint = `${config.jitoBlockEngine}/api/v1/bundles`;
    const resp = await axios.post(endpoint, bundlePayload, {
      headers: { "Content-Type": "application/json" },
      timeout: 10_000,
    });

    const bundleId = resp.data?.result as string;
    logger.info("Jito bundle gönderildi", { bundleId, tipLamports });
    return { bundleId, status: "accepted" };
  } catch (err: any) {
    const msg = err?.response?.data?.error?.message || err.message;
    logger.warn("Jito bundle reddedildi, fallback yapılıyor", { error: msg });

    // Fallback: normal RPC ile gönder
    try {
      const txBuf = Buffer.from(signedTxBase64, "base64");
      const sig = await connection.sendRawTransaction(txBuf, {
        skipPreflight: false,
        maxRetries: 3,
      });
      return { bundleId: sig, status: "accepted" };
    } catch (fallbackErr: any) {
      return { bundleId: "", status: "rejected", error: fallbackErr.message };
    }
  }
}

/**
 * Kullanıcının önerilen Jito tip miktarını hesaplar (son 10 blok bazında).
 */
export async function getOptimalTipLamports(): Promise<number> {
  try {
    const resp = await axios.get(
      `${config.jitoBlockEngine}/api/v1/bundles/tip_floor`,
      { timeout: 5_000 }
    );
    const floor: number = resp.data?.landed_tips_75th_percentile ?? 0;
    // Min 5000, max 100000 lamport arası tut
    return Math.min(Math.max(floor, 5_000), 100_000);
  } catch {
    return config.jitoTipLamports; // default
  }
}
