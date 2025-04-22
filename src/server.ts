// src/server.ts
import express, { Request, Response } from "express";
import cors from "cors";
import { google } from "googleapis";
import dotenv from "dotenv";
import fetch from "node-fetch";
import bodyParser from "body-parser";
import fs from "fs";
import { join } from "path";

dotenv.config();

console.log("✅ TokenTrader iniciado...");

const app = express();
const PORT = process.env.PORT || 4000;

const credentialsPath = join(__dirname, "../credentials.json");
const credentials = JSON.parse(fs.readFileSync(credentialsPath, "utf-8")).web;

const CLIENT_ID = credentials.client_id;
const CLIENT_SECRET = credentials.client_secret;
const REDIRECT_URI = credentials.redirect_uris[0];

const API_URL_CLOUDFLARE =
  process.env.API_URL_CLOUDFLARE ||
  "https://v539peby84.execute-api.us-east-2.amazonaws.com/lambda/GetCloudflareURLLambda";

app.use(cors());
app.use(bodyParser.json());

const solicitudesPendientes: Record<
  string,
  { instance_name: string; url?: string; token?: any }
> = {};

app.get("/prueba", (_, res) => {
  console.log("⚙️  /prueba recibido");
  res.send("✅ TokenTrader activo y funcionando.");
});

app.post("/register", async (req: Request, res: Response) => {
  const { bot_id, instance_name, url } = req.body;
  if (!bot_id || !instance_name) {
    res.status(400).json({ error: "Faltan datos" });
    return;
  }
  solicitudesPendientes[bot_id] = { instance_name, url };
  console.log(
    `📌 Registro para ${bot_id} con instancia '${instance_name}' y url: ${
      url ?? "<ninguno>"
    }`
  );
  res.json({ status: "registrado" });
});

app.get("/auth/callback", async (req: Request, res: Response) => {
  const code = req.query.code as string;
  const bot_id = req.query.state as string;

  if (!code || !bot_id || !solicitudesPendientes[bot_id]) {
    console.warn("⚠️ Callback incompleto", { code, bot_id });
    res.status(400).send("Solicitud inválida o no registrada.");
    return;
  }

  const { instance_name, url } = solicitudesPendientes[bot_id];
  const oAuth2Client = new google.auth.OAuth2(
    CLIENT_ID,
    CLIENT_SECRET,
    REDIRECT_URI
  );

  console.log(`🔐 Autenticando ${bot_id} (instancia: ${instance_name})...`);

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    solicitudesPendientes[bot_id].token = tokens;

    res.send("✅ Autenticado correctamente. Puedes cerrar esta ventana.");
    console.log("✅ Token recibido. Enviando a la instancia...");

    const urlBot =
      instance_name === "bot_nacho" ? url : await obtenerURLBot(instance_name);

    if (!urlBot) {
      throw new Error("No se pudo determinar la URL del bot");
    }

    const response = await fetch(`${urlBot}/oauth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bot_id, tokens }),
    });

    if (!response.ok) {
      const errorMsg = await response.text();
      throw new Error(`❌ Falló el envío al bot: ${errorMsg}`);
    }

    console.log(`🚀 Token enviado al bot ${bot_id} (${urlBot}) correctamente.`);
  } catch (err) {
    console.error("❌ Error en auth callback:", err);
  }
});

const obtenerURLBot = async (instance_name: string): Promise<string | null> => {
  try {
    const res = await fetch(API_URL_CLOUDFLARE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instance_name, url: "true" }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { url?: string };
    return data?.url ?? null;
  } catch (err) {
    console.error("❌ Error obteniendo URL del bot:", err);
    return null;
  }
};

app.listen(PORT, () => {
  console.log(`🚀 TokenTrader corriendo en http://localhost:${PORT}`);
});
