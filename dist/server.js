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
console.log("iniciado");
const app = (0, express_1.default)();
const PORT = process.env.PORT || 4000;
// Cargar credenciales desde credentials.json
const credentialsPath = (0, path_1.join)(__dirname, "../credentials.json");
const credentials = JSON.parse(fs_1.default.readFileSync(credentialsPath, "utf-8")).web;
const CLIENT_ID = credentials.client_id;
const CLIENT_SECRET = credentials.client_secret;
const REDIRECT_URI = credentials.redirect_uris[0];
// URL externa para pedir el Cloudflare URL del bot
const API_URL_CLOUDFLARE = process.env.API_URL_CLOUDFLARE ||
    "https://v539peby84.execute-api.us-east-2.amazonaws.com/lambda/GetCloudflareURLLambda";
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
// Estado temporal por bot
const solicitudesPendientes = {};
// 1️⃣ - Endpoint para registrar solicitud de autorización desde el dashboard
app.post("/register", async (req, res) => {
    const { bot_id, instance_name } = req.body;
    if (!bot_id || !instance_name) {
        res.status(400).json({ error: "Faltan datos" });
        return;
    }
    solicitudesPendientes[bot_id] = { instance_name };
    res.json({ status: "registrado" });
});
// 2️⃣ - Google Auth callback
app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;
    const bot_id = req.query.state;
    if (!code || !bot_id || !solicitudesPendientes[bot_id]) {
        res.status(400).send("Solicitud inválida o no registrada.");
        return;
    }
    const oAuth2Client = new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        solicitudesPendientes[bot_id].token = tokens;
        res.send("✅ Autenticado correctamente. Puedes cerrar esta ventana.");
    }
    catch (err) {
        console.error("❌ Error en auth callback:", err);
        res.status(500).send("Error procesando token");
    }
});
// 3️⃣ - Endpoint para procesar el truque (verifica token + pide URL + envía al bot)
app.post("/dispatch", async (req, res) => {
    const { bot_id } = req.body;
    if (!bot_id || !solicitudesPendientes[bot_id]) {
        res.status(400).json({ error: "Bot no registrado" });
        return;
    }
    const instance_name = solicitudesPendientes[bot_id].instance_name;
    const token = solicitudesPendientes[bot_id].token;
    if (!token) {
        res.status(400).json({ error: "Token de Google aún no recibido" });
        return;
    }
    try {
        const urlBot = await obtenerURLBot(instance_name);
        if (!urlBot) {
            res.status(500).json({ error: "No se pudo obtener la URL del bot" });
            return;
        }
        const resp = await (0, node_fetch_1.default)(`${urlBot}/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tokens: token }),
        });
        if (!resp.ok)
            throw new Error("Error al enviar token al bot");
        res.json({ status: "Token enviado al bot con éxito" });
    }
    catch (err) {
        console.error("❌ Error en dispatch:", err);
        res.status(500).json({ error: "Falló el despacho del token" });
    }
});
// 4️⃣ - Función para obtener la URL del bot desde API externa
const obtenerURLBot = async (instance_name) => {
    try {
        const bodyUrl = JSON.stringify({ instance_name, url: "true" });
        const res = await (0, node_fetch_1.default)(API_URL_CLOUDFLARE, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: bodyUrl,
        });
        if (!res.ok)
            return null;
        const data = (await res.json()); // ✅ Fix final
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
