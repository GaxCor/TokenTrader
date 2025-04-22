"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
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
const BOT_URL = process.env.BOT_URL;
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
// 0️⃣ - Ping para comprobar que el servicio está vivo
app.get("/prueba", (_, res) => {
    console.log("⚙️  /prueba recibido");
    res.send("✅ TokenTrader activo y funcionando.");
});
// 1️⃣ - Endpoint para registrar solicitud de autorización desde el dashboard
app.post("/register", async (req, res) => {
    const { bot_id, instance_name } = req.body;
    if (!bot_id || !instance_name) {
        res.status(400).json({ error: "Faltan datos" });
        return;
    }
    solicitudesPendientes[bot_id] = { instance_name };
    console.log(`📌 Registro de autorización solicitado para ${bot_id} con instancia '${instance_name}'`);
    res.json({ status: "registrado" });
});
// 2️⃣ - Google Auth callback
app.get("/auth/callback", async (req, res) => {
    const code = req.query.code;
    const bot_id = req.query.state;
    if (!code || !bot_id || !solicitudesPendientes[bot_id]) {
        console.warn("⚠️ Callback recibido con datos incompletos", {
            code,
            bot_id,
        });
        res.status(400).send("Solicitud inválida o no registrada.");
        return;
    }
    const instance_name = solicitudesPendientes[bot_id].instance_name;
    const oAuth2Client = new googleapis_1.google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
    console.log(`🔐 Autenticando ${bot_id} (instancia: ${instance_name})...`);
    try {
        const { tokens } = await oAuth2Client.getToken(code);
        solicitudesPendientes[bot_id].token = tokens;
        res.send("✅ Autenticado correctamente. Puedes cerrar esta ventana.");
        console.log("✅ Token recibido. Enviando a la instancia...");
        // Disparar automáticamente el despacho del token
        await despacharToken(bot_id, tokens, instance_name);
    }
    catch (err) {
        console.error("❌ Error en auth callback:", err);
        res.status(500).send("Error procesando token");
    }
});
// 3️⃣ - Endpoint opcional para despachar token manualmente
app.post("/dispatch", async (req, res) => {
    const { bot_id } = req.body;
    if (!bot_id || !solicitudesPendientes[bot_id]) {
        res.status(400).json({ error: "Bot no registrado" });
        return;
    }
    const { token, instance_name } = solicitudesPendientes[bot_id];
    if (!token) {
        res.status(400).json({ error: "Token de Google aún no recibido" });
        return;
    }
    try {
        await despacharToken(bot_id, token, instance_name);
        res.json({ status: "Token enviado al bot con éxito" });
    }
    catch (err) {
        console.error("❌ Error en dispatch manual:", err);
        res.status(500).json({ error: "Falló el despacho del token" });
    }
});
// 4️⃣ - Lógica para enviar el token al bot destino
const despacharToken = async (bot_id, token, instance_name) => {
    const urlBot = await obtenerURLBot(instance_name);
    if (!urlBot)
        throw new Error("No se pudo obtener la URL del bot");
    const resp = await (0, node_fetch_1.default)(`${urlBot}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ bot_id, tokens: token }),
    });
    if (!resp.ok) {
        const errorMsg = await resp.text();
        throw new Error(`Error al enviar token: ${errorMsg}`);
    }
    console.log(`🚀 Token enviado al bot ${bot_id} (${urlBot}) correctamente.`);
};
// 5️⃣ - Función para obtener la URL del bot desde API externa o variable
const obtenerURLBot = async (instance_name) => {
    if (instance_name === "bot_nacho") {
        console.log("🔁 Usando BOT_URL directamente para bot_nacho");
        return BOT_URL ?? null;
    }
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
