/**
 * BOT CRUJI - Empanadas y Pasteles del Norte - Popayán
 * Stack: WhatsApp Cloud API (Meta) + Groq (Whisper para audio + Llama para entender el pedido)
 *
 * Variables de entorno:
 *   WHATSAPP_TOKEN   token de acceso de Meta
 *   PHONE_ID         Phone Number ID del numero de prueba
 *   GROQ_API_KEY     clave de Groq (sirve para voz y para el cerebro)
 *   VERIFY_TOKEN     texto que tu inventas, el mismo que pones en el webhook de Meta
 *   APP_SECRET       (opcional) App Secret de Meta, activa la validacion de firma
 *   MI_NUMERO_COCINA (opcional) numero con 57 adelante, para el aviso de pedidos
 */

import express from "express";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";

const {
  WHATSAPP_TOKEN,
  PHONE_ID,
  GROQ_API_KEY,
  GROQ_MODEL = "openai/gpt-oss-120b",
  VERIFY_TOKEN = "cruji123",
  APP_SECRET,
  MI_NUMERO_COCINA,
} = process.env;

const GRAPH = "https://graph.facebook.com/v22.0";

// ---------- MENU Y PRECIOS (el total se calcula aqui, no el modelo) ----------
const MENU = {
  pastel_pollo: { nombre: "Pastel de pollo", precio: 5500 },
  empanada_clasica: { nombre: "Empanada clásica", precio: 3000 },
  sabor_tradicional: { nombre: "Empanada sabor tradicional", precio: 2800 },
  combo_norte: { nombre: "Combo Norte (2 pasteles + 4 clásicas)", precio: 24000 },
};
const BARRIOS = ["Ciudad Jardín", "La Paz", "Santa Clara", "El Recuerdo"];

const pesos = (n) => "$" + n.toLocaleString("es-CO");

function menuTexto() {
  const lineas = Object.values(MENU).map((p) => `• ${p.nombre}: ${pesos(p.precio)}`);
  return `Esto es lo que tenemos:\n${lineas.join("\n")}\n(Hay ají de maní 😉) ¿Qué se te antoja?`;
}

// ---------- MEMORIA POR CLIENTE (en RAM; se pierde si el servidor reinicia) ----------
const historial = new Map(); // numero -> [{role, content}]
const MAX_MSGS = 10;

function recordar(numero, role, content) {
  const h = historial.get(numero) || [];
  h.push({ role, content });
  while (h.length > MAX_MSGS) h.shift();
  historial.set(numero, h);
}

// ---------- DEDUPLICACION (Meta a veces reenvia el mismo mensaje) ----------
const vistos = new Set();
function yaVisto(id) {
  if (vistos.has(id)) return true;
  vistos.add(id);
  if (vistos.size > 2000) vistos.delete(vistos.values().next().value);
  return false;
}

// ---------- WHATSAPP ----------
async function enviarWhatsApp(to, body) {
  try {
    await axios.post(
      `${GRAPH}/${PHONE_ID}/messages`,
      { messaging_product: "whatsapp", to, text: { body } },
      { headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` } }
    );
  } catch (e) {
    console.error("Error enviando WhatsApp a", to, JSON.stringify(e.response?.data || e.message));
  }
}

async function transcribirAudio(audioId) {
  const meta = await axios.get(`${GRAPH}/${audioId}`, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
  });
  const audio = await axios.get(meta.data.url, {
    headers: { Authorization: `Bearer ${WHATSAPP_TOKEN}` },
    responseType: "arraybuffer",
  });
  const form = new FormData();
  form.append("file", Buffer.from(audio.data), { filename: "audio.ogg", contentType: "audio/ogg" });
  form.append("model", "whisper-large-v3-turbo");
  form.append("language", "es");
  const r = await axios.post("https://api.groq.com/openai/v1/audio/transcriptions", form, {
    headers: { ...form.getHeaders(), Authorization: `Bearer ${GROQ_API_KEY}` },
  });
  return r.data.text?.trim() || "";
}

// ---------- CEREBRO ----------
const SYSTEM_PROMPT = `Eres el asistente de pedidos de CRUJI, empanadas y pasteles del norte de Popayán.
Tono: amiguero, cálido, cercano, colombiano neutro, sin jerga paisa. Máximo 2 líneas y 1 emoji suave.

Productos (usa SOLO estos ids):
- pastel_pollo
- empanada_clasica
- sabor_tradicional
- combo_norte (2 pasteles + 4 empanadas clásicas)
También hay ají de maní.

Barrios con domicilio: ${BARRIOS.join(", ")}.

Tu trabajo: leer toda la conversación y devolver el pedido ACUMULADO (lo que el cliente quiere en total hasta ahora), aunque lo diga enredado.
- Si falta el barrio, pídelo amable en "respuesta".
- Si el barrio no está en la lista, di con amabilidad que por ahora solo llegan a esos barrios.
- Si no queda claro qué producto quiere, pregunta.
- NUNCA menciones precios ni totales en "respuesta"; eso lo calcula el sistema.
- Si el cliente solo saluda o pregunta algo general, responde breve y pregunta qué desea pedir.
- Si el cliente pregunta qué hay, qué tienes, el menú o los precios, pon "mostrar_menu": true y en "respuesta" escribe solo una frase corta de apertura; el sistema agrega la lista con precios.
- Si pide algo que no vendemos (por ejemplo hamburguesas), dilo con amabilidad y ofrece lo que sí hay.

Responde SOLO con un objeto JSON válido, sin texto adicional ni markdown, con esta forma exacta:
{"productos":[{"id":"pastel_pollo","cantidad":2}],"barrio":"Ciudad Jardín o vacío","mostrar_menu":false,"respuesta":"texto para el cliente"}
Si no hay productos aún, usa "productos": [].`;

async function interpretar(numero) {
  const body = {
    model: GROQ_MODEL,
    response_format: { type: "json_object" },
    temperature: 0.3,
    messages: [{ role: "system", content: SYSTEM_PROMPT }, ...(historial.get(numero) || [])],
  };
  // Los modelos gpt-oss razonan; en "low" responden rapido
  if (GROQ_MODEL.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";

  // Hasta 2 intentos: a veces el modelo devuelve JSON mal formado
  let ultimoError;
  for (let intento = 1; intento <= 2; intento++) {
    try {
      const r = await axios.post("https://api.groq.com/openai/v1/chat/completions", body, {
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        timeout: 30000,
      });
      const contenido = r.data.choices[0].message.content || "";
      const limpio = contenido.replace(/```json|```/g, "").trim();
      const objeto = limpio.match(/\{[\s\S]*\}/);
      return JSON.parse(objeto ? objeto[0] : limpio);
    } catch (e) {
      ultimoError = e;
      console.error(`Cerebro intento ${intento} fallo:`, JSON.stringify(e.response?.data || e.message));

      // Si el modelo respondio bien pero sin formato JSON, aprovechamos esa respuesta
      const generado = e.response?.data?.error?.failed_generation;
      if (typeof generado === "string" && generado.trim()) {
        const bloque = generado.match(/\{[\s\S]*\}/);
        if (bloque) {
          try {
            return JSON.parse(bloque[0]);
          } catch (_) {
            /* no era JSON valido, seguimos abajo */
          }
        }
        const texto = generado.replace(/["}\s]+$/, "").replace(/^["{\s]+/, "").trim();
        if (texto) return { productos: [], barrio: "", mostrar_menu: false, respuesta: texto };
      }

      // En el segundo intento pedimos sin modo JSON estricto
      if (intento === 1) delete body.response_format;
    }
  }
  throw ultimoError;
}

function construirPedido(parsed) {
  const items = [];
  let total = 0;
  for (const p of parsed.productos || []) {
    const prod = MENU[p.id];
    const cant = Number(p.cantidad);
    if (!prod || !Number.isInteger(cant) || cant <= 0) continue;
    items.push({ nombre: prod.nombre, cantidad: cant, subtotal: prod.precio * cant });
    total += prod.precio * cant;
  }
  const barrio = BARRIOS.find((b) => b.toLowerCase() === String(parsed.barrio || "").trim().toLowerCase());
  return { items, total, barrio };
}

// ---------- PROCESO PRINCIPAL ----------
async function procesarMensaje(message) {
  const from = message.from;
  let texto = "";

  if (message.type === "audio") {
    console.log("Audio recibido de", from);
    texto = await transcribirAudio(message.audio.id);
    console.log("Transcrito:", texto);
  } else if (message.type === "text") {
    texto = message.text.body;
  } else {
    await enviarWhatsApp(from, "¡Hola! Por ahora entiendo texto y notas de voz 😊 ¿Qué se te antoja pedir?");
    return;
  }

  if (!texto) {
    await enviarWhatsApp(from, "No alcancé a escucharte bien, ¿me lo repites por favor? 😊");
    return;
  }

  recordar(from, "user", texto);

  let parsed;
  try {
    parsed = await interpretar(from);
  } catch (e) {
    console.error("Error en el cerebro:", e.response?.data || e.message);
    await enviarWhatsApp(from, `Uy, se me enredó algo por un momento 😅\n${menuTexto()}`);
    return;
  }

  const { items, total, barrio } = construirPedido(parsed);

  // Pedido completo: productos + barrio valido -> confirma con total calculado aqui
  if (items.length > 0 && barrio) {
    const lista = items.map((i) => `${i.cantidad}x ${i.nombre}`).join(", ");
    const confirmacion = `¡Listo! ${lista} para ${barrio}. Total: ${pesos(total)}. Te llega en unos 15 minutos 😊`;
    await enviarWhatsApp(from, confirmacion);

    if (MI_NUMERO_COCINA) {
      const aviso =
        `🔔 NUEVO PEDIDO CRUJI\nCliente: ${from}\nBarrio: ${barrio}\n` +
        items.map((i) => `${i.cantidad}x ${i.nombre} (${pesos(i.subtotal)})`).join("\n") +
        `\nTotal: ${pesos(total)}`;
      await enviarWhatsApp(MI_NUMERO_COCINA, aviso);
    }
    historial.delete(from); // pedido cerrado, empieza limpio
    return;
  }

  // Pedido incompleto: responde lo que genero el modelo (pide barrio o producto)
  let respuesta = parsed.respuesta || "¿Qué te gustaría pedir? 😊";
  if (parsed.mostrar_menu) respuesta += `\n\n${menuTexto()}`;
  recordar(from, "assistant", respuesta);
  await enviarWhatsApp(from, respuesta);
}

// ---------- SERVIDOR ----------
const app = express();
app.use(
  express.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

app.get("/", (_req, res) => res.send("CRUJI bot activo"));

// Verificacion del webhook
app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    console.log("Webhook verificado");
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

// Recepcion de mensajes
app.post("/webhook", (req, res) => {
  // Validar firma de Meta si hay APP_SECRET
  if (APP_SECRET) {
    const firma = req.get("x-hub-signature-256") || "";
    const esperada =
      "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(req.rawBody || "").digest("hex");
    const ok =
      firma.length === esperada.length &&
      crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
    if (!ok) {
      console.warn("Firma invalida, peticion ignorada");
      return res.sendStatus(401);
    }
  }

  // Responder 200 YA para que Meta no reintente; se procesa despues
  res.sendStatus(200);

  const message = req.body.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message || yaVisto(message.id)) return;
  console.log(`Mensaje recibido de ${message.from} (${message.type})`);

  procesarMensaje(message).catch((e) =>
    console.error("Error procesando mensaje:", e.response?.data || e.message)
  );
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`CRUJI bot corriendo en puerto ${PORT}`));
