"use strict";
// Integration tests — calisir backend sunucusuna HTTP istegi atar
// Calistirmak icin: npm run dev & npm test
const BASE = process.env.TEST_API_URL ?? "http://localhost:4000";
async function get(path) {
    const res = await fetch(`${BASE}${path}`);
    return { status: res.status, body: await res.json() };
}
async function post(path, data) {
    const res = await fetch(`${BASE}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
    });
    return { status: res.status, body: await res.json() };
}
async function del(path) {
    const res = await fetch(`${BASE}${path}`, { method: "DELETE" });
    return { status: res.status, body: await res.json() };
}
async function patch(path) {
    const res = await fetch(`${BASE}${path}`, { method: "PATCH" });
    return { status: res.status, body: await res.json() };
}
// ── Health ──────────────────────────────────────────────────────
describe("Health", () => {
    it("GET /health → 200 ok", async () => {
        const { status, body } = await get("/health");
        expect(status).toBe(200);
        expect(body.status).toBe("ok");
        expect(body.version).toBe("1.0.0");
    });
    it("GET /api/unknown → 404", async () => {
        const { status } = await get("/api/unknown-route-xyz");
        expect(status).toBe(404);
    });
});
// ── Pre-Trade ───────────────────────────────────────────────────
describe("Pre-Trade Check", () => {
    const MINT = "So11111111111111111111111111111111111111112";
    it("GET /api/pre-trade-check?tokenMint=<valid> → 200", async () => {
        const { status, body } = await get(`/api/pre-trade-check?tokenMint=${MINT}`);
        expect(status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.data).toHaveProperty("mevRisk");
        expect(body.data).toHaveProperty("recommendation");
        expect(["safe", "caution", "danger"]).toContain(body.data.recommendation);
    }, 10000);
    it("GET /api/pre-trade-check without tokenMint → 400", async () => {
        const { status } = await get("/api/pre-trade-check");
        expect(status).toBe(400);
    });
});
// ── Orders ──────────────────────────────────────────────────────
describe("Orders API", () => {
    const USER = `test-${Date.now()}`;
    const MINT = "So11111111111111111111111111111111111111112";
    let orderId = "";
    it("POST /api/orders → 201", async () => {
        const { status, body } = await post("/api/orders", {
            userId: USER, tokenMint: MINT, tokenSymbol: "TEST",
            amount: 1000, targetPriceSol: 0.0001, type: "stop_loss", onChainOrderId: 99,
        });
        expect(status).toBe(201);
        expect(body.data.status).toBe("active");
        orderId = body.data.id;
    });
    it("GET /api/orders/:userId → 200 with list", async () => {
        const { status, body } = await get(`/api/orders/${USER}`);
        expect(status).toBe(200);
        expect(body.data.length).toBeGreaterThan(0);
    });
    it("DELETE /api/orders/:id?userId → 200", async () => {
        const { status } = await del(`/api/orders/${orderId}?userId=${USER}`);
        expect(status).toBe(200);
    });
    it("DELETE without userId → 400", async () => {
        const { status } = await del(`/api/orders/fake-id`);
        expect(status).toBe(400);
    });
    it("POST with bad data → 400", async () => {
        const { status } = await post("/api/orders", { userId: "x", tokenMint: "short", amount: -1 });
        expect(status).toBe(400);
    });
});
// ── Copy Trade ──────────────────────────────────────────────────
describe("Copy Trade API", () => {
    const USER = `ct-${Date.now()}`;
    const MASTER = "HuJpxYfM55Dk3P9Zzx6btRLfHGhhMgZPaS3VzJiB8VjS";
    let tradeId = "";
    it("POST /api/copy-trade → 201", async () => {
        const { status, body } = await post("/api/copy-trade", {
            userId: USER, masterWallet: MASTER, spendLimitLamports: 1000000000,
        });
        expect(status).toBe(201);
        expect(body.data.active).toBe(true);
        tradeId = body.data.id;
    });
    it("GET /api/copy-trade/:userId → 200", async () => {
        const { status, body } = await get(`/api/copy-trade/${USER}`);
        expect(status).toBe(200);
        expect(body.data.length).toBeGreaterThan(0);
    });
    it("PATCH toggle → 200 (aktif → pasif)", async () => {
        const { status, body } = await patch(`/api/copy-trade/${tradeId}/toggle?userId=${USER}`);
        expect(status).toBe(200);
        expect(body.data.active).toBe(false);
    });
    it("PATCH toggle without userId → 400", async () => {
        const { status } = await patch(`/api/copy-trade/${tradeId}/toggle`);
        expect(status).toBe(400);
    });
    it("POST with short masterWallet → 400", async () => {
        const { status } = await post("/api/copy-trade", {
            userId: USER, masterWallet: "short", spendLimitLamports: 1e9,
        });
        expect(status).toBe(400);
    });
});
// ── Security ────────────────────────────────────────────────────
describe("Security", () => {
    it("Webhook without secret → 401", async () => {
        const res = await fetch(`${BASE}/api/smart-money/webhook`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify([{}]),
        });
        expect(res.status).toBe(401);
    });
    it("Response never echoes <script> tag", async () => {
        const { body } = await post("/api/copy-trade", {
            userId: "<script>alert(1)</script>",
            masterWallet: "HuJpxYfM55Dk3P9Zzx6btRLfHGhhMgZPaS3VzJiB8VjS",
            spendLimitLamports: 1e9,
        });
        expect(JSON.stringify(body)).not.toContain("<script>");
    });
});
