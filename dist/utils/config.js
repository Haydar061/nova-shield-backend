"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.config = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
exports.config = {
    port: parseInt(process.env.PORT || "4000"),
    nodeEnv: process.env.NODE_ENV || "development",
    rpcUrl: process.env.RPC_URL,
    heliusApiKey: process.env.HELIUS_API_KEY,
    programId: process.env.PROGRAM_ID,
    novaMint: process.env.NOVA_MINT,
    stakingPool: process.env.STAKING_POOL,
    jitoBlockEngine: process.env.JITO_BLOCK_ENGINE_URL || "https://mainnet.block-engine.jito.wtf",
    jitoTipLamports: parseInt(process.env.JITO_TIP_LAMPORTS || "10000"),
    rugcheckBaseUrl: process.env.RUGCHECK_BASE_URL || "https://api.rugcheck.xyz/v1",
    webhookSecret: process.env.WEBHOOK_SECRET || "secret",
};
