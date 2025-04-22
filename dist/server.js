"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/server.ts
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const googleapis_1 = require("googleapis");
const dotenv_1 = __importDefault(require("dotenv"));
const node_fetch_1 = __importDefault(require("node-fetch"));
const body_parser_1 = __importDefault(require("body-parser"));
const fs_1 = __importDefault(require("fs"));
const path_1 = require("path");
dotenv_1.default.config();
console.log("✅ TokenTrader iniciado...");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
const credentialsPath = (0, path_1.join)(__dirname, "../credentials.json");
const credentials = JSON.parse(fs_1.default.readFileSync(credentialsPath, "utf-8")).web;
const CLIENT_ID = credentials.client_id;
const CLIENT_SECRET = credentials.client_secret;
const REDIRECT_URI = credentials.redirect_uris[0];
const API_URL_CLOUDFLARE = process.env.API_URL_CLOUDFLARE ||
    "https://v539peby84.execute-api.us-east-2.amazonaws.com/lambda/GetCloudflareURLLambda";
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
const solicitudesPendientes = {};
app.get("/prueba", (_, res) => {
    console.log("⚙️  /prueba recibido");
    res.send("✅ TokenTrader activo y funcionando.");
});
app.post("/register", async (req, res) => {
    const { bot_id, instance_name, url } = req.body;
    if (!bot_id || !instance_name) {
        res.status(400).json({ error: "Faltan datos" });
        return;
    }
    solicitudesPendientes[bot_id] = { instance_name, url };
    console.log(`📌 Registro para ${bot_id} con instancia '${instance_name}' y url: ${url ?? "<ninguno>"}`);
    res.json({ status: "registrado" });
});
app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;
    const bot_id = req.query.state;
    if (!code || !bot_id || !solicitudesPendientes[bot_id]) {
        console.warn("⚠️ Callback incompleto", { code, bot_id });
        res.status(400).send("Solicitud inválida o no registrada.");
        return;
    }
    const { instance_name, url } = solicitudesPendientes[bot_id];
    const oAuth2Client = new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    console.log(`🔐 Autenticando ${bot_id} (instancia: ${instance_name})...`);
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        solicitudesPendientes[bot_id].token = tokens;
        res.send("✅ Autenticado correctamente. Puedes cerrar esta ventana.");
        console.log("✅ Token recibido. Enviando a la instancia...");
        const urlBot = instance_name === "bot_nacho" ? url : await obtenerURLBot(instance_name);
        if (!urlBot) {
            throw new Error("No se pudo determinar la URL del bot");
        }
        const response = await (0, node_fetch_1.default)(`${urlBot}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ bot_id, tokens }),
        });
        if (!response.ok) {
            const errorMsg = await response.text();
            throw new Error(`❌ Falló el envío al bot: ${errorMsg}`);
        }
        console.log(`🚀 Token enviado al bot ${bot_id} (${urlBot}) correctamente.`);
    }
    catch (err) {
        console.error("❌ Error en auth callback:", err);
    }
});
const obtenerURLBot = async (instance_name) => {
    try {
        const res = await (0, node_fetch_1.default)(API_URL_CLOUDFLARE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ instance_name, url: "true" }),
        });
        if (!res.ok)
            return null;
        const data = (await res.json());
        return data?.url ?? null;
    }
    catch (err) {
        console.error("❌ Error obteniendo URL del bot:", err);
        return null;
    }
};
app.listen(PORT, () => {
    console.log(`🚀 TokenTrader corriendo en http://localhost:${PORT}`);
});
