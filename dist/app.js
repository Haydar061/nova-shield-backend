"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const express_1 = __importDefault(require("express"));
const http_1 = __importDefault(require("http"));
const helmet_1 = __importDefault(require("helmet"));
const cors_1 = __importDefault(require("cors"));
const ws_1 = require("ws");
const logger_1 = require("./utils/logger");
const config_1 = require("./utils/config");
const security_1 = require("./middleware/security");
const smartmoney_service_1 = require("./services/smartmoney.service");
const keeper_service_1 = require("./services/keeper.service");
const pretrade_route_1 = __importDefault(require("./routes/pretrade.route"));
const mev_route_1 = __importDefault(require("./routes/mev.route"));
const rugcheck_route_1 = __importDefault(require("./routes/rugcheck.route"));
const smartmoney_route_1 = __importDefault(require("./routes/smartmoney.route"));
const orders_route_1 = __importDefault(require("./routes/orders.route"));
const copytrade_route_1 = __importDefault(require("./routes/copytrade.route"));
const jito_route_1 = __importDefault(require("./routes/jito.route"));
const app = (0, express_1.default)();
const server = http_1.default.createServer(app);
// ── Middleware ─────────────────────────────────────────────────────────────────
app.use((0, helmet_1.default)());
app.use((0, cors_1.default)({ origin: "*", methods: ["GET", "POST", "PATCH", "DELETE"] }));
app.use(express_1.default.json({ limit: "1mb" }));
app.use(security_1.rateLimiter);
// ── Routes ─────────────────────────────────────────────────────────────────────
app.get("/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now(), version: "1.0.0" });
});
app.use("/api/pre-trade-check", pretrade_route_1.default);
app.use("/api/mev", mev_route_1.default);
app.use("/api/token-risk", rugcheck_route_1.default);
app.use("/api/smart-money", smartmoney_route_1.default);
app.use("/api/orders", orders_route_1.default);
app.use("/api/copy-trade", copytrade_route_1.default);
app.use("/api/jito", jito_route_1.default);
// ── 404 Handler ────────────────────────────────────────────────────────────────
app.use((_req, res) => {
    res.status(404).json({ error: "Endpoint bulunamadı" });
});
// ── Hata Handler ───────────────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
    logger_1.logger.error("Unhandled error", { error: err.message, stack: err.stack });
    res.status(500).json({ error: "Sunucu hatası" });
});
// ── WebSocket (Smart Money anlık bildirimleri) ─────────────────────────────────
const wss = new ws_1.WebSocketServer({ server, path: "/api/smart-money/subscribe" });
wss.on("connection", (ws) => {
    logger_1.logger.info("WebSocket client bağlandı");
    (0, smartmoney_service_1.registerWsClient)(ws);
    ws.send(JSON.stringify({ type: "connected", message: "NovaShield smart money stream" }));
});
// ── Sunucu Başlat ──────────────────────────────────────────────────────────────
server.listen(config_1.config.port, () => {
    logger_1.logger.info(`NovaShield Backend çalışıyor → http://localhost:${config_1.config.port}`);
    logger_1.logger.info(`WebSocket → ws://localhost:${config_1.config.port}/api/smart-money/subscribe`);
    (0, keeper_service_1.startKeeperBot)();
});
exports.default = app;
