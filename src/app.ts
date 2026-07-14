import "dotenv/config";
import express from "express";
import http from "http";
import helmet from "helmet";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";

import { logger } from "./utils/logger";
import { config } from "./utils/config";
import { rateLimiter } from "./middleware/security";
import { registerWsClient } from "./services/smartmoney.service";
import { startKeeperBot } from "./services/keeper.service";

import pretradeRoute  from "./routes/pretrade.route";
import mevRoute       from "./routes/mev.route";
import rugcheckRoute  from "./routes/rugcheck.route";
import smartmoneyRoute from "./routes/smartmoney.route";
import ordersRoute    from "./routes/orders.route";
import copytradeRoute from "./routes/copytrade.route";
import jitoRoute      from "./routes/jito.route";

const app = express();
const server = http.createServer(app);

// ── Middleware ─────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(cors({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE"] }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimiter);

// ── Routes ─────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: Date.now(), version: "1.0.0" });
});

app.use("/api/pre-trade-check", pretradeRoute);
app.use("/api/mev",             mevRoute);
app.use("/api/token-risk",      rugcheckRoute);
app.use("/api/smart-money",     smartmoneyRoute);
app.use("/api/orders",          ordersRoute);
app.use("/api/copy-trade",      copytradeRoute);
app.use("/api/jito",            jitoRoute);

// ── 404 Handler ────────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: "Endpoint bulunamadı" });
});

// ── Hata Handler ───────────────────────────────────────────────────────────────
app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  logger.error("Unhandled error", { error: err.message, stack: err.stack });
  res.status(500).json({ error: "Sunucu hatası" });
});

// ── WebSocket + Sunucu (sadece Vercel dışında) ────────────────────────────────
if (!process.env.VERCEL) {
  const wss = new WebSocketServer({ server, path: "/api/smart-money/subscribe" });
  wss.on("connection", (ws: WebSocket) => {
    logger.info("WebSocket client bağlandı");
    registerWsClient(ws);
    ws.send(JSON.stringify({ type: "connected", message: "NovaShield smart money stream" }));
  });

  server.listen(config.port, () => {
    logger.info(`NovaShield Backend çalışıyor → http://localhost:${config.port}`);
    logger.info(`WebSocket → ws://localhost:${config.port}/api/smart-money/subscribe`);
    startKeeperBot();
  });
}

export default app;
