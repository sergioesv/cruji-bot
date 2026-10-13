/**
 * BOT DE PEDIDOS POR WHATSAPP v5.9 (Pedidito) — sirve para cualquier negocio de comida: todo lo del negocio va en menu.js
 * WhatsApp Cloud API (Meta) + Groq (Whisper para notas de voz + modelo que entiende pedidos)
 *
 * ARCHIVOS
 *   server.js  este archivo (no hace falta tocarlo)
 *   menu.js    productos, precios, bebidas, salsas, barrios, horario, datos del negocio y memes
 *   memes/     (opcional) carpeta con las imágenes de los memes que se nombran en menu.js
 *
 * VARIABLES EN RAILWAY
 *   WHATSAPP_TOKEN, PHONE_ID, GROQ_API_KEY, VERIFY_TOKEN, APP_SECRET
 *   MI_NUMERO_COCINA  celular principal (con 57): recibe pedidos y atiende cuando el bot pasa a una persona
 *   ADMINS            (opcional) otros celulares del equipo separados por coma: reciben pedidos y,
 *                     si el principal no responde en 5 minutos, también los casos de atención
 *   GROQ_MODEL        (opcional) por defecto openai/gpt-oss-120b
 *   PUBLIC_URL        (opcional) dirección pública del bot para los memes; Railway la da sola
 *
 * COMANDOS: desde un celular del equipo escríbele /ayuda al bot.
 */

import express from "express";
import axios from "axios";
import FormData from "form-data";
import crypto from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import * as MENU from "./menu.js";
const { PRODUCTOS, SALSAS, NEGOCIO } = MENU;
const MEMES = MENU.MEMES || {}; // si un menu.js viejo no tiene memes, el bot funciona igual sin ellos

// ======================= CONFIGURACIÓN =======================
const env = process.env;
const { WHATSAPP_TOKEN, PHONE_ID, GROQ_API_KEY, APP_SECRET } = env;
const VERIFY_TOKEN = env.VERIFY_TOKEN || "cruji123";
const GROQ_MODEL = env.GROQ_MODEL || "openai/gpt-oss-120b";
const GRAPH = "https://graph.facebook.com/v22.0";

const soloDigitos = (s) => String(s || "").replace(/\D/g, "");
// WhatsApp ya deja que algunas personas oculten su número: entonces llegan con un ID tipo "CO.1234567890" (BSUID)
const esTelefono = (id) => /^\d{7,15}$/.test(String(id || ""));
const idDe = (s) => {
  const t = String(s || "").trim();
  return /[a-z]/i.test(t) ? t : soloDigitos(t);
};
const COCINA = idDe(env.MI_NUMERO_COCINA);
const EQUIPO = [...new Set([COCINA, ...String(env.ADMINS || "").split(",").map(idDe)].filter(Boolean))];

const ENCARGADO = String(NEGOCIO.encargado || "").trim();
// Identidad del negocio (menu.js)
const MARCA = String(NEGOCIO.marca || "nuestro negocio").trim();
const EMOJI = String(NEGOCIO.emoji || "😋").trim();
const LEMA = String(NEGOCIO.lema || "").trim();
const DESCRIPCION_NEGOCIO = String(NEGOCIO.descripcion || "un negocio de comida a domicilio").trim();
const EJEMPLO_PEDIDO = String(NEGOCIO.ejemploPedido || "").trim();
const REGLAS_PRODUCTOS = String(NEGOCIO.reglasProductos || "").trim();
const CON_QUIEN = ENCARGADO ? `con ${ENCARGADO}` : "con alguien del equipo";
const A_QUIEN = ENCARGADO ? `a ${ENCARGADO}` : "al equipo";
// Barrios: puede ser una lista ["La Paz", ...] o un objeto { "La Paz": 2000, ... } con la tarifa de cada uno
const TARIFAS = new Map();
if (Array.isArray(NEGOCIO.barrios)) NEGOCIO.barrios.forEach((b) => TARIFAS.set(String(b).trim(), null));
else Object.entries(NEGOCIO.barrios || {}).forEach(([b, v]) => TARIFAS.set(String(b).trim(), v === null || v === "" ? null : Number(v)));
TARIFAS.delete("");
const BARRIOS = [...TARIFAS.keys()];
const COSTO_DOMICILIO = Number(NEGOCIO.costoDomicilio) || 0; // tarifa general si el barrio no tiene una propia
// Cobro por distancia (opcional): ubicación del local + tabla de tarifas
const LOCAL_GPS =
  NEGOCIO.ubicacionLocal && Number.isFinite(Number(NEGOCIO.ubicacionLocal.lat)) && Number.isFinite(Number(NEGOCIO.ubicacionLocal.lng))
    ? { lat: Number(NEGOCIO.ubicacionLocal.lat), lng: Number(NEGOCIO.ubicacionLocal.lng) }
    : null;
const TABLA_DISTANCIA = (NEGOCIO.tarifasPorDistancia || [])
  .map((t) => ({ hastaKm: Number(t.hastaKm), valor: Number(t.valor) }))
  .filter((t) => t.hastaKm > 0 && t.valor >= 0)
  .sort((a, b) => a.hastaKm - b.hastaKm);
const POR_DISTANCIA = Boolean(LOCAL_GPS && TABLA_DISTANCIA.length);
const PEDIDO_MINIMO = Number(NEGOCIO.pedidoMinimo) || 0;
const NEQUI = soloDigitos(NEGOCIO.nequi);
const NEQUI_TITULAR = String(NEGOCIO.nequiTitular || "").trim(); // a nombre de quién está el Nequi (el cliente lo ve al transferir)
const TELEFONO = String(NEGOCIO.telefono || "").trim();
const LOCAL = String(NEGOCIO.direccionLocal || "").trim();
const IMAGEN_MENU = String(NEGOCIO.imagenMenu || "").trim();
const CATALOGO_WA = soloDigitos(NEGOCIO.catalogoWhatsApp); // ID del catálogo de Meta (opcional): activa el carrito de WhatsApp
const INFORMACION = String(NEGOCIO.informacion || "").trim();
const TIEMPO_BASE = String(NEGOCIO.tiempoEntrega || "30 a 40 minutos").trim();
let tiempoEntrega = TIEMPO_BASE;

const MIN = 60 * 1000;
const T = {
  rafaga: Number(env.ESPERA_RAFAGA_MS) || 2500, // espera para juntar mensajes seguidos del mismo cliente
  cambios: (Number(NEGOCIO.minutosParaCambios) || 10) * MIN,
  esperaPersona: (Number(NEGOCIO.minutosEsperaPersona) || 5) * MIN,
  alertaPedido: (Number(NEGOCIO.minutosAlertaPedido) || 45) * MIN,
  liberarPersona: 30 * MIN, // sin mensajes de nadie en este tiempo, el bot retoma
  recordarConfirmacion: 10 * MIN,
  reinicio: 3 * 60 * MIN, // conversación nueva tras 3 horas sin escribir
  limpieza: 12 * 60 * MIN,
};
const ahora = () => Date.now() + (globalThis.__desfaseTiempo || 0);

// Pedir el tipo con botones ("una salchi" → Sencilla / Lomo / Chorizo)
const PT = NEGOCIO.preguntarTipo || {};
const TIPOS = (PT.productos || []).filter((id) => PRODUCTOS[id]).slice(0, 3);
const PALABRAS_TIPO = (PT.palabras || []).map((w) => String(w).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")).filter(Boolean);
const PREGUNTA_TIPO = String(PT.pregunta || "¿Cuál quieres? 👇").trim();
// Mensajes cortos (menu.js → mensajesCortos: true): la gente lee la notificación sin abrir el chat
const CORTO = NEGOCIO.mensajesCortos === true;
const SALSAS_EN_MENU = SALSAS.mostrarEnMenu !== false;
const SALSAS_EN_RESUMEN = SALSAS.mostrarEnResumen !== false;

// ======================= UTILIDADES =======================
const norm = (s) =>
  String(s || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/️/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
const pesos = (n) => "$" + Math.round(Number(n) || 0).toLocaleString("es-CO");
const cortar = (s, n) => Array.from(String(s || "")).slice(0, n).join("");
const minutosDesde = (ts) => Math.max(0, Math.round((ahora() - ts) / MIN));
const unir = (...partes) => partes.flat().filter(Boolean).join("\n\n");
const minutosMaximosEntrega = () => {
  const nums = String(tiempoEntrega).match(/\d+/g);
  return nums ? Number(nums[nums.length - 1]) : 40;
};

// ======================= PRODUCTOS =======================
const IDS = Object.keys(PRODUCTOS);
const agotados = new Set();
const esBebida = (id) => norm(PRODUCTOS[id]?.categoria).includes("bebida");

function buscarProducto(texto) {
  const t = norm(texto);
  if (!t) return null;
  let mejor = null;
  let largo = 0;
  for (const [id, p] of Object.entries(PRODUCTOS)) {
    for (const candidato of [id.replace(/_/g, " "), p.nombre, p.corto, ...(p.alias || [])]) {
      const n = norm(candidato);
      if (n && (t === n || t.includes(n)) && n.length > largo) {
        mejor = id;
        largo = n.length;
      }
    }
  }
  return mejor;
}

function validarProductos(lista) {
  const mapa = new Map();
  const quitados = new Set();
  for (const p of lista || []) {
    const id = p?.id;
    const cantidad = Math.round(Number(p?.cantidad));
    if (!PRODUCTOS[id] || !(cantidad > 0)) continue;
    if (agotados.has(id)) {
      quitados.add(PRODUCTOS[id].nombre);
      continue;
    }
    const nota = String(p.nota || "").trim();
    const clave = `${id}|${norm(nota)}`;
    const previo = mapa.get(clave);
    if (!previo) mapa.set(clave, { id, cantidad, nota, vistas: new Set([cantidad]) });
    else if (!previo.vistas.has(cantidad)) {
      // "2 pasteles y otros 3" en líneas distintas: se suman. Una línea repetida idéntica (error del modelo): se ignora.
      previo.cantidad += cantidad;
      previo.vistas.add(cantidad);
    }
  }
  return { carrito: [...mapa.values()].map(({ id, cantidad, nota }) => ({ id, cantidad, nota })), quitados: [...quitados] };
}

const nombreItem = (i) => `${PRODUCTOS[i.id].nombre}${i.nota ? ` (${i.nota})` : ""}`;
const listaCarrito = (carrito) => carrito.map((i) => `${i.cantidad}x ${nombreItem(i)}`).join(", ");
const unidades = (carrito) => carrito.reduce((s, i) => s + i.cantidad, 0);

// ---------- Domicilio dinámico ----------
// Distancia en km por calles (aprox.): línea recta × 1.3
function kmPorCalles(u) {
  if (!LOCAL_GPS || !u) return null;
  const rad = (g) => (g * Math.PI) / 180;
  const dLat = rad(u.lat - LOCAL_GPS.lat);
  const dLng = rad(u.lng - LOCAL_GPS.lng);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(rad(LOCAL_GPS.lat)) * Math.cos(rad(u.lat)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)) * 1.3;
}
// Devuelve { valor, detalle } o { fuera: true, km } si la ubicación está más lejos que la tabla
function domicilioDe(c) {
  if (c.entrega === "recoger") return { valor: 0, detalle: "" };
  if (c.domicilioManual != null) return { valor: c.domicilioManual, detalle: c.barrio || "" };
  if (POR_DISTANCIA && c.ubicacion) {
    const km = kmPorCalles(c.ubicacion);
    const tramo = TABLA_DISTANCIA.find((t) => km <= t.hastaKm);
    if (!tramo) return { fuera: true, km };
    return { valor: tramo.valor, detalle: `${km.toFixed(1).replace(".", ",")} km` };
  }
  const b = barrioCubierto(c);
  if (b && TARIFAS.get(b) != null) return { valor: TARIFAS.get(b), detalle: b };
  return { valor: COSTO_DOMICILIO, detalle: b || "" };
}

function calcular(c, carrito = c.carrito) {
  const subtotal = carrito.reduce((s, i) => s + PRODUCTOS[i.id].precio * i.cantidad, 0);
  const d = domicilioDe(c);
  const domicilio = d.fuera ? 0 : d.valor;
  return { subtotal, domicilio, total: subtotal + domicilio, detalleDomicilio: d.detalle || "" };
}

function textoTarifas() {
  if (POR_DISTANCIA) return `según la distancia (desde ${pesos(TABLA_DISTANCIA[0].valor)})`;
  const valores = [...TARIFAS.values()].filter((v) => v != null);
  if (!valores.length) return COSTO_DOMICILIO ? pesos(COSTO_DOMICILIO) : "";
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  return min === max ? (min ? pesos(min) : "gratis") : `desde ${pesos(min)} según el barrio`;
}

// Menú: lo principal (productos y combos) con detalle; bebidas y salsas en una línea al final.
// Los sabores no se listan aquí: el bot los pregunta cuando el cliente pide ese producto.
const minuscula = (s) => s.charAt(0).toLowerCase() + s.slice(1);
const esCategoria = (cat, palabra) => norm(cat).includes(palabra);

function menuTexto() {
  const grupos = new Map();
  for (const id of IDS) {
    const cat = PRODUCTOS[id].categoria;
    grupos.set(cat, [...(grupos.get(cat) || []), id]);
  }
  const principales = [];
  const alFinal = [];
  let salsaExtra = null;
  for (const [cat, ids] of grupos) {
    const disponibles = ids.filter((id) => !agotados.has(id));
    if (esCategoria(cat, "bebida")) {
      if (disponibles.length) {
        const desde = Math.min(...disponibles.map((id) => PRODUCTOS[id].precio));
        alFinal.push(
          CORTO ? `🥤 Bebidas desde ${pesos(desde)}` : `🥤 Bebidas: ${disponibles.map((id) => minuscula(PRODUCTOS[id].corto || PRODUCTOS[id].nombre)).join(", ")} (desde ${pesos(desde)})`
        );
      }
      continue;
    }
    if (esCategoria(cat, "salsa")) {
      if (disponibles.length) salsaExtra = Math.min(...disponibles.map((id) => PRODUCTOS[id].precio));
      continue;
    }
    const lineas = ids.map((id) => {
      const p = PRODUCTOS[id];
      const nombre = p.corto || p.nombre;
      if (agotados.has(id)) return `• ${nombre}: agotado hoy 😔`;
      return `• ${nombre} — ${pesos(p.precio)}${p.descripcion ? `\n   _${p.descripcion}_` : ""}`;
    });
    principales.push(`*${cat}*\n${lineas.join("\n")}`);
  }
  if (SALSAS.incluidas?.length && SALSAS_EN_MENU) {
    const sal = SALSAS.incluidas.map(minuscula);
    alFinal.push(`🌶️ Incluye ${sal.length <= 2 ? sal.join(" o ") : sal.slice(0, -1).join(", ") + " y " + sal.at(-1)}${salsaExtra != null ? ` (porción extra ${pesos(salsaExtra)})` : ""}`);
  }
  if (CORTO) {
    alFinal.push([textoTarifas() ? `🛵 Domicilio ${textoTarifas()}` : "", NEQUI ? "💜 Nequi o efectivo" : "💵 Efectivo"].filter(Boolean).join(" · "));
  } else {
    if (textoTarifas()) alFinal.push(`🛵 Domicilio: ${textoTarifas()}`);
    alFinal.push(NEQUI ? "💜 Pagas por Nequi o en efectivo" : "💵 Pago en efectivo al recibir");
  }
  if (PEDIDO_MINIMO) alFinal.push(`Pedido mínimo para domicilio: ${pesos(PEDIDO_MINIMO)}`);
  return unir(principales.join("\n\n"), alFinal.join("\n"));
}

// ======================= HORARIO =======================
function aMinutos(v) {
  const m = String(v || "").trim().match(/^(\d{1,2})(?::(\d{2}))?$/);
  return m ? Number(m[1]) * 60 + Number(m[2] || 0) : null;
}
const ABRE = aMinutos(NEGOCIO.horaAbre);
const CIERRA = aMinutos(NEGOCIO.horaCierra);
let cerradoManual = false;

function minutosBogota() {
  const partes = new Intl.DateTimeFormat("en-GB", {
    timeZone: "America/Bogota",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(ahora()));
  const valor = (tipo) => Number(partes.find((p) => p.type === tipo)?.value || 0);
  return valor("hour") * 60 + valor("minute");
}
function dentroDeHorario() {
  if (ABRE == null || CIERRA == null) return true;
  const m = minutosBogota();
  return ABRE <= CIERRA ? m >= ABRE && m < CIERRA : m >= ABRE || m < CIERRA;
}
const abierto = () => !cerradoManual && dentroDeHorario();
function fmtHora(min) {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return `${h % 12 || 12}${m ? ":" + String(m).padStart(2, "0") : ""} ${h < 12 ? "a. m." : "p. m."}`;
}
function mensajeCerrado() {
  if (cerradoManual) return "Por ahora no estamos recibiendo pedidos 😔 ¡Gracias por escribirnos! Vuelve a intentarlo más tarde.";
  return `Ahora estamos cerrados 😴 Atendemos de ${fmtHora(ABRE)} a ${fmtHora(CIERRA)}. ¡Te esperamos!`;
}

// ======================= CLIENTES (memoria) =======================
// Nota: vive en la memoria del servidor; si Railway reinicia, se pierde (siguiente paso: Supabase).
const clientes = new Map();
const porCodigo = new Map();
let contador = 0;

function obtenerCliente(num, nombrePerfil) {
  let c = clientes.get(num);
  if (!c) {
    c = {
      num,
      nombre: "",
      historial: [],
      carrito: [],
      entrega: "domicilio",
      barrio: "",
      barrioAceptado: "",
      domicilioManual: null,
      direccion: "",
      ubicacion: null,
      pago: "",
      pagaCon: null,
      salsas: "",
      notas: "",
      preguntoPago: false,
      ofrecioBebida: false,
      pidioUbicacion: false,
      menuEnviado: 0,
      desdeLista: null,
      estado: "armando", // armando | esperando_confirmacion | confirmado
      resumenEnviado: 0,
      recordoConfirmacion: false,
      pedido: null,
      pedidoAnterior: null,
      humano: null,
      fallos: 0,
      paso: "",
      pasoVeces: 0,
      avisoCerrado: 0,
      ultimaActividad: ahora(),
      codigo: null,
      ultimoCodigoPedido: null,
    };
    clientes.set(num, c);
  }
  if (nombrePerfil && !c.nombre) c.nombre = String(nombrePerfil).trim();
  return c;
}

function codigoDe(c) {
  if (!c.codigo) {
    c.codigo = ++contador;
    porCodigo.set(c.codigo, c.num);
  }
  return c.codigo;
}
function codigoParaPedidoNuevo(c) {
  if (c.codigo && c.codigo !== c.ultimoCodigoPedido) {
    c.ultimoCodigoPedido = c.codigo;
    return c.codigo;
  }
  c.codigo = ++contador;
  porCodigo.set(c.codigo, c.num);
  c.ultimoCodigoPedido = c.codigo;
  return c.codigo;
}
const clientePorCodigo = (n) => clientes.get(porCodigo.get(Number(n)));

function recordar(c, role, content) {
  if (!content) return;
  c.historial.push({ role, content: cortar(content, 1500) });
  while (c.historial.length > 14) c.historial.shift();
}

function reiniciarSiHaceFalta(c) {
  const t = ahora();
  const inactivo = t - c.ultimaActividad > T.reinicio;
  const terminado = c.pedido && ["entregado", "cancelado"].includes(c.pedido.estado);
  const viejo = c.pedido && t - c.pedido.ts > T.reinicio;
  if (!inactivo && !terminado && !viejo) return;
  if (c.pedido) c.pedidoAnterior = c.pedido;
  Object.assign(c, {
    historial: [],
    carrito: [],
    entrega: "domicilio",
    pago: "",
    pagaCon: null,
    salsas: "",
    notas: "",
    preguntoPago: false,
    ofrecioBebida: false,
    ofrecioCompartir: false,
    memeCambio: false,
    memesPedido: 0,
    cantidadPendiente: null,
    pidioTelefono: false,
    pidioUbicacion: false,
    estado: "armando",
    recordoConfirmacion: false,
    pedido: null,
    fallos: 0,
    paso: "",
    pasoVeces: 0,
  });
  // Se conservan nombre, barrio, dirección y ubicación: aparecen en el resumen y el cliente los puede cambiar.
}

// "Huella" del pedido para saber si el cliente cambió algo (ignora tildes, mayúsculas y signos)
const suave = (s) => norm(s).replace(/[^a-z0-9ñ ]/g, "").replace(/\s+/g, " ").trim();
const huella = (c) =>
  JSON.stringify([
    c.carrito.map((i) => [i.id, i.cantidad, suave(i.nota)]).sort(),
    c.entrega,
    suave(c.barrio),
    suave(c.direccion),
    c.ubicacion,
    c.pago,
    c.pagaCon,
    suave(c.salsas),
    suave(c.notas),
  ]);

// ======================= WHATSAPP =======================
const authMeta = () => ({ Authorization: `Bearer ${WHATSAPP_TOKEN}` });

async function enviar(to, payload) {
  if (!to) {
    console.error("No se envió: mensaje sin destinatario");
    return { ok: false };
  }
  // Teléfono → "to". Número oculto (ID "CO.123…") → "recipient"
  const destino = esTelefono(to) ? { to } : { recipient: to };
  try {
    const r = await axios.post(
      `${GRAPH}/${PHONE_ID}/messages`,
      { messaging_product: "whatsapp", recipient_type: "individual", ...destino, ...payload },
      { headers: authMeta(), timeout: 15000 }
    );
    return { ok: true, id: r.data?.messages?.[0]?.id };
  } catch (e) {
    const err = e.response?.data?.error;
    console.error(`Error enviando a ${to}:`, JSON.stringify(err || e.message));
    alertaToken(err?.code);
    return { ok: false, codigo: err?.code };
  }
}

// Si el token de WhatsApp venció o no tiene permisos, dejarlo MUY claro en los logs (máximo una vez cada 10 min)
let ultimaAlertaToken = 0;
function alertaToken(codigo) {
  if (![190, 131005, 10, 200].includes(Number(codigo))) return;
  if (Date.now() - ultimaAlertaToken < 10 * 60 * 1000) return;
  ultimaAlertaToken = Date.now();
  console.error(
    "\n🚨🚨🚨 EL TOKEN DE WHATSAPP NO SIRVE (venció o no tiene permisos). El bot recibe mensajes pero NO puede responder.\n" +
      "   Arreglo: genera un token nuevo (ideal: el permanente del usuario del sistema) y ponlo en Railway → Variables → WHATSAPP_TOKEN.\n"
  );
}
const enviarTexto = (to, texto) => enviar(to, { type: "text", text: { body: cortar(texto, 4000), preview_url: false } });

async function enviarBotones(to, texto, botones, respaldo = "Responde *SÍ* para confirmar, o dime qué quieres cambiar.") {
  const r = await enviar(to, {
    type: "interactive",
    interactive: {
      type: "button",
      body: { text: cortar(texto, 1024) },
      action: { buttons: botones.map(([id, title]) => ({ type: "reply", reply: { id, title: cortar(title, 20) } })) },
    },
  });
  if (r.ok) return r;
  return enviarTexto(to, respaldo ? `${texto}\n\n${respaldo}` : texto);
}
const BOTONES_RESUMEN = [
  ["confirmar", "✅ Confirmar"],
  ["cambiar", "✏️ Cambiar algo"],
  ["humano", "Hablar con alguien"],
];

async function responder(c, texto) {
  recordar(c, "assistant", texto);
  return enviarTexto(c.num, texto);
}

async function marcarLeido(id) {
  const base = { messaging_product: "whatsapp", status: "read", message_id: id };
  try {
    await axios.post(`${GRAPH}/${PHONE_ID}/messages`, { ...base, typing_indicator: { type: "text" } }, { headers: authMeta(), timeout: 10000 });
  } catch {
    try {
      await axios.post(`${GRAPH}/${PHONE_ID}/messages`, base, { headers: authMeta(), timeout: 10000 });
    } catch {
      /* no es grave */
    }
  }
}

// ======================= MEMES =======================
// Las imágenes viven en la carpeta "memes" y el mismo bot las publica en https://<tu-bot>/memes/archivo.jpg
const CARPETA_MEMES = path.join(path.dirname(fileURLToPath(import.meta.url)), "memes");
let memesEnCarpeta = new Set();
try {
  memesEnCarpeta = new Set(fs.readdirSync(CARPETA_MEMES).filter((f) => /\.(jpe?g|png)$/i.test(f)));
} catch {
  /* sin carpeta de memes: no se mandan */
}
const MEMES_ACTIVOS = MEMES.activo !== false && memesEnCarpeta.size > 0;
const PROB_MEME = Math.min(1, Math.max(0, Number(env.MEMES_PROBABILIDAD ?? MEMES.probabilidad ?? 0.5)));
const MEMES_SIEMPRE = new Set(MEMES.siempre || ["sticker"]);
const MAX_MEMES = Math.max(0, Number(env.MEMES_MAXIMO ?? MEMES.maximoPorPedido ?? 3)); // por conversación, para no cansar
const HORA_NOCHE = aMinutos(MEMES.horaNoche || "21") ?? 21 * 60;
// Dirección pública: PUBLIC_URL, o la que Railway da sola, o la que usa Meta para llamar al webhook
let urlPublica = String(env.PUBLIC_URL || (env.RAILWAY_PUBLIC_DOMAIN ? `https://${env.RAILWAY_PUBLIC_DOMAIN}` : "")).replace(/\/+$/, "");
const memesDe = (momento) => (MEMES.momentos?.[momento] || []).filter((f) => memesEnCarpeta.has(f));
const memesFaltantes = Object.values(MEMES.momentos || {})
  .flat()
  .filter((f) => !memesEnCarpeta.has(f));

// Manda un meme del momento (si toca). Nunca rompe el flujo: si falla, sigue como si nada.
async function enviarMeme(c, momento) {
  try {
    if (!MEMES_ACTIVOS || !urlPublica || c.humano) return false;
    if (c.sinMemesHasta && ahora() < c.sinMemesHasta) return false; // estuvo molesto o con una queja
    const lista = memesDe(momento);
    if (!lista.length) return false;
    if (!MEMES_SIEMPRE.has(momento) && Math.random() >= PROB_MEME) return false;
    if (ahora() - (c.ultimoMeme || 0) < 15 * 1000) return false; // máximo uno por turno
    if (!MEMES_SIEMPRE.has(momento) && (c.memesPedido || 0) >= MAX_MEMES) return false; // ya van suficientes en este pedido
    c.memesVistos = c.memesVistos || [];
    const nuevos = lista.filter((f) => !c.memesVistos.includes(f));
    const opciones = nuevos.length ? nuevos : lista;
    const archivo = opciones[Math.floor(Math.random() * opciones.length)];
    const r = await enviar(c.num, { type: "image", image: { link: `${urlPublica}/memes/${encodeURIComponent(archivo)}` } });
    if (r.ok) {
      c.ultimoMeme = ahora();
      c.memesPedido = (c.memesPedido || 0) + 1;
      c.memesVistos.push(archivo);
      if (c.memesVistos.length > 40) c.memesVistos.shift();
    }
    return r.ok;
  } catch {
    return false;
  }
}
// Meme primero, una pausa corta y luego el mensaje concreto: así la notificación que ve el cliente es la útil
const PAUSA_SALUDO = Number(env.PAUSA_MEME_MS ?? (Number(MEMES.pausaSaludoSegundos ?? 5) * 1000));
const PAUSA_PEDIDO = Number(env.PAUSA_MEME_MS ?? (Number(MEMES.pausaSegundos ?? 2.5) * 1000));
const esperarMs = (ms) => new Promise((r) => setTimeout(r, ms));
async function memeAntes(c, momento, pausa = PAUSA_PEDIDO) {
  const ok = await enviarMeme(c, momento);
  if (ok && pausa > 0) await esperarMs(pausa);
  return ok;
}
const silenciarMemes = (c, minutos = 60) => {
  c.sinMemesHasta = ahora() + minutos * MIN;
};
const esDeNoche = () => {
  const m = minutosBogota();
  return m >= HORA_NOCHE || m < 5 * 60;
};

// "Anotado: ..." solo si ese mismo listado no se acaba de decir en el mensaje (evita repetir el pedido dos veces)
const eco = (pre, lista) => (pre.includes(lista) ? "" : `Anotado: ${lista} ✅\n`);
// Igual que eco, pero si ya se le dijo esa misma lista al cliente, no se repite (mensajes más cortos)
function ecoUnaVez(c, pre, lista) {
  const e = eco(pre, lista);
  if (!e) return "";
  if (CORTO && c.ecoDicho === lista) return "";
  c.ecoDicho = lista;
  return e;
}
const tituloCategoria = (cat, max) => cortar(String(cat).replace(/^[^\p{L}\p{N}]+/u, "").trim() || "Menú", max);
const CONSEJO_TODO_JUNTO = EJEMPLO_PEDIDO ? `💡 También puedes escribirme todo junto, ej: *${EJEMPLO_PEDIDO}*` : "💡 También puedes escribirme todo tu pedido en un solo mensaje";

// Lista de WhatsApp para elegir con un toque (máximo 10 productos)
async function enviarLista(c, cuerpo, boton = "🛒 Elegir producto") {
  const filas = IDS.filter((id) => PRODUCTOS[id].enLista && !agotados.has(id)).slice(0, 10);
  if (!filas.length) return { ok: false };
  const secciones = new Map();
  for (const id of filas) {
    const p = PRODUCTOS[id];
    const titulo = tituloCategoria(p.categoria, 24);
    secciones.set(titulo, [
      ...(secciones.get(titulo) || []),
      { id: `prod:${id}`, title: cortar(p.corto || p.nombre, 24), description: cortar(`${p.descripcion ? p.descripcion + " · " : ""}${pesos(p.precio)}`, 72) },
    ]);
  }
  return enviar(c.num, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: cortar(cuerpo, 4096) },
      action: { button: cortar(boton, 20), sections: [...secciones].map(([title, rows]) => ({ title, rows })) },
    },
  });
}

// Lista desplegable SOLO de bebidas (se ofrece después de elegir la comida): cada fila se anota con un toque
async function enviarListaBebidas(c, cuerpo) {
  const filas = IDS.filter((id) => esBebida(id) && !agotados.has(id)).slice(0, 9);
  if (!filas.length) return { ok: false };
  const rows = filas.map((id) => {
    const p = PRODUCTOS[id];
    const detalle = p.opciones?.length ? `${pesos(p.precio)} · ${p.opciones.join(", ")}` : pesos(p.precio);
    return { id: `prod:${id}`, title: cortar(p.corto || p.nombre, 24), description: cortar(detalle, 72) };
  });
  rows.unshift({ id: "bebida_no", title: "🙅 No, gracias", description: "Seguir sin bebida" }); // primera opción: seguir rápido
  return enviar(c.num, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: cortar(cuerpo, 1024) },
      action: { button: "🥤 Elegir bebida", sections: [{ title: "🥤 Bebidas", rows }] },
    },
  });
}

// Carrito nativo de WhatsApp (si hay catálogo de Meta): el cliente agrega varias cosas y lo envía de una vez
async function enviarCatalogo(c, intro) {
  if (!CATALOGO_WA) return { ok: false };
  const secciones = new Map();
  for (const id of IDS.filter((i) => !agotados.has(i))) {
    const titulo = tituloCategoria(PRODUCTOS[id].categoria, 24);
    secciones.set(titulo, [...(secciones.get(titulo) || []), { product_retailer_id: id }]);
  }
  return enviar(c.num, {
    type: "interactive",
    interactive: {
      type: "product_list",
      header: { type: "text", text: cortar(`Menú ${MARCA} ${EMOJI}`, 60) },
      body: { text: cortar(`${intro}\n\nAgrega al carrito todo lo que quieras 🛒 y me lo envías.`, 1024) },
      footer: { text: "O escríbeme tu pedido 😊" },
      action: { catalog_id: CATALOGO_WA, sections: [...secciones].slice(0, 10).map(([title, product_items]) => ({ title, product_items: product_items.slice(0, 30) })) },
    },
  });
}

async function enviarMenu(c, intro = "¡Claro! Este es nuestro menú 😋") {
  // 1) Con catálogo de Meta: carrito nativo (varias cosas a la vez, con fotos)
  const cat = await enviarCatalogo(c, intro);
  if (cat.ok) {
    recordar(c, "assistant", `${intro}\n[Se envió el catálogo con carrito]`);
    c.menuEnviado = ahora();
    return cat;
  }
  // 2) Sin catálogo: foto del menú (opcional) + carta en texto con lista para elegir
  if (IMAGEN_MENU) await enviar(c.num, { type: "image", image: { link: IMAGEN_MENU, caption: cortar(intro, 1000) } });
  const cuerpo = CORTO
    ? `${IMAGEN_MENU ? "" : intro + "\n\n"}${menuTexto()}\n\n${EJEMPLO_PEDIDO ? `💡 Escríbeme, ej: *${EJEMPLO_PEDIDO}*\n` : ""}¿Cuál te provoca? 👇`
    : `${IMAGEN_MENU ? "" : intro + "\n\n"}${menuTexto()}\n\n${CONSEJO_TODO_JUNTO}\n\n¿Qué se te antoja? Escríbeme o elige aquí 👇`;
  recordar(c, "assistant", cuerpo);
  let r = await enviarLista(c, cuerpo);
  if (!r.ok) r = await enviarTexto(c.num, cuerpo);
  if (r.ok) c.menuEnviado = ahora(); // solo cuenta como "ya lo vio" si de verdad le llegó
  return r;
}

// Después de elegir algo de la lista: "¿Algo más?" con la lista otra vez, hasta que diga "listo"
async function preguntarAlgoMas(c, pre = "") {
  const principales = c.carrito.filter((i) => !esBebida(i.id));
  if (!c.ofrecioCompartir && principales.length === 1 && principales[0].cantidad === 1) {
    c.ofrecioCompartir = true;
    await memeAntes(c, "compartir");
  }
  const texto = `${pre}${ecoUnaVez(c, pre, listaCarrito(c.carrito))}¿Algo más? 😊`;
  c.paso = "mas";
  c.pasoVeces = 0;
  recordar(c, "assistant", texto);
  return enviarBotones(
    c.num,
    texto,
    [
      ["mas_fin", "✅ Eso es todo"],
      ["mas_agregar", "➕ Agregar algo"],
    ],
    "Escríbeme qué más quieres, o dime *no, gracias* y seguimos 😊"
  );
}

// ---------- Avisos al equipo (con reintento si WhatsApp no los entrega) ----------
const avisosEnviados = new Map(); // id del mensaje -> { a, texto }
const pendientesEquipo = [];

async function avisarA(a, texto, botones = null) {
  let r;
  if (botones?.length) {
    // Con botones para cocina (máximo 3). Si el texto es muy largo, va el texto y luego los botones
    if (Array.from(texto).length <= 1000) r = await enviarBotones(a, texto, botones, "");
    else {
      r = await enviarTexto(a, texto);
      if (r.ok) await enviarBotones(a, "👆 ¿Qué hacemos?", botones, "");
    }
  } else r = await enviarTexto(a, texto);
  if (r.ok) {
    if (r.id) {
      avisosEnviados.set(r.id, { a, texto, botones });
      if (avisosEnviados.size > 500) avisosEnviados.delete(avisosEnviados.keys().next().value);
    }
    return true;
  }
  pendientesEquipo.push({ a, texto, botones });
  console.error(`⚠️ El aviso a ${a} no salió. Ese celular debe escribirle algo al bot (ej: /ayuda) para volver a recibir avisos.`);
  return false;
}
async function avisarEquipo(texto, destinos = EQUIPO, botones = null) {
  if (!destinos.length) {
    console.warn("⚠️ Falta MI_NUMERO_COCINA: nadie está recibiendo los avisos.");
    return false;
  }
  let alguno = false;
  for (const a of destinos) alguno = (await avisarA(a, texto, botones)) || alguno;
  return alguno;
}
function manejarEstadoEntrega(st) {
  if (st?.status !== "failed") return;
  console.error(`Mensaje a ${st.recipient_id || st.recipient_user_id} no entregado:`, JSON.stringify(st.errors?.[0] || {}));
  const info = avisosEnviados.get(st.id);
  if (info) {
    avisosEnviados.delete(st.id);
    pendientesEquipo.push(info);
    console.error(`⚠️ Un aviso para ${info.a} no llegó (probablemente pasaron 24 h sin que ese celular le escribiera al bot). Se reenviará cuando escriba.`);
  }
}
async function reenviarPendientes(a) {
  const mios = pendientesEquipo.filter((p) => p.a === a);
  if (!mios.length) return;
  for (let i = pendientesEquipo.length - 1; i >= 0; i--) if (pendientesEquipo[i].a === a) pendientesEquipo.splice(i, 1);
  await enviarTexto(a, `📥 Tenías ${mios.length} aviso(s) que no te habían llegado:`);
  for (const p of mios) await avisarA(a, p.texto, p.botones);
}

// ---------- Audio y archivos ----------
async function transcribirAudio(audioId) {
  try {
    const info = await axios.get(`${GRAPH}/${audioId}`, { headers: authMeta() });
    const audio = await axios.get(info.data.url, { headers: authMeta(), responseType: "arraybuffer" });
    const form = new FormData();
    form.append("file", Buffer.from(audio.data), { filename: "audio.ogg", contentType: "audio/ogg" });
    form.append("model", "whisper-large-v3-turbo");
    form.append("language", "es");
    const r = await axios.post("https://api.groq.com/openai/v1/audio/transcriptions", form, {
      headers: { ...form.getHeaders(), Authorization: `Bearer ${GROQ_API_KEY}` },
      timeout: 30000,
    });
    return String(r.data?.text || "").trim();
  } catch (e) {
    console.error("Error transcribiendo audio:", JSON.stringify(e.response?.data || e.message));
    return "";
  }
}

async function reenviarArchivo(media, tipo, caption, destinos) {
  try {
    const info = await axios.get(`${GRAPH}/${media.id}`, { headers: authMeta() });
    const archivo = await axios.get(info.data.url, { headers: authMeta(), responseType: "arraybuffer" });
    const mime = info.data.mime_type || media.mime_type || "application/octet-stream";
    const form = new FormData();
    form.append("messaging_product", "whatsapp");
    form.append("type", mime);
    form.append("file", Buffer.from(archivo.data), {
      filename: media.filename || (tipo === "image" ? "imagen.jpg" : "archivo"),
      contentType: mime,
    });
    const subida = await axios.post(`${GRAPH}/${PHONE_ID}/media`, form, { headers: { ...form.getHeaders(), ...authMeta() } });
    const cuerpo =
      tipo === "image"
        ? { type: "image", image: { id: subida.data.id, caption: cortar(caption, 1000) } }
        : { type: "document", document: { id: subida.data.id, caption: cortar(caption, 1000), filename: media.filename || "archivo" } };
    for (const a of destinos) await enviar(a, cuerpo);
  } catch (e) {
    console.error("No se pudo reenviar el archivo:", JSON.stringify(e.response?.data || e.message));
    await avisarEquipo(`${caption}\n(No pude reenviarte el archivo; pídeselo al cliente.)`, destinos);
  }
}

// ======================= CEREBRO (Groq) =======================
const INTENCIONES = ["saludo", "pedido", "pregunta", "confirmar", "cancelar", "estado_pedido", "queja", "hablar_humano", "agradecimiento", "otro"];

const ESQUEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "intencion", "productos", "falta_aclarar", "entrega", "barrio", "direccion", "nombre",
    "pago", "paga_con", "salsas", "notas", "mostrar_menu", "frustrado", "necesita_humano", "respuesta",
  ],
  properties: {
    intencion: { type: "string", enum: INTENCIONES },
    productos: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["id", "cantidad", "nota"],
        properties: { id: { type: "string", enum: IDS }, cantidad: { type: "integer" }, nota: { type: "string" } },
      },
    },
    falta_aclarar: { type: "boolean" },
    entrega: { type: "string", enum: ["", "domicilio", "recoger"] },
    barrio: { type: "string" },
    direccion: { type: "string" },
    nombre: { type: "string" },
    pago: { type: "string", enum: ["", "efectivo", "nequi"] },
    paga_con: { type: ["integer", "null"] },
    salsas: { type: "string" },
    notas: { type: "string" },
    mostrar_menu: { type: "boolean" },
    frustrado: { type: "boolean" },
    necesita_humano: { type: "boolean" },
    respuesta: { type: "string" },
  },
};

function infoNegocio() {
  const l = [];
  l.push(BARRIOS.length ? `Domicilios a: ${BARRIOS.join(", ")}.` : "Hacemos domicilios.");
  l.push(`Tiempo de entrega aproximado: ${tiempoEntrega}.`);
  if (POR_DISTANCIA) l.push(`El domicilio se cobra según la distancia (desde ${pesos(TABLA_DISTANCIA[0].valor)}); el valor exacto sale en el resumen.`);
  else if ([...TARIFAS.values()].some((v) => v != null)) {
    l.push(`Costo del domicilio por barrio: ${[...TARIFAS].map(([b, v]) => `${b} ${v != null ? (v ? pesos(v) : "gratis") : "por confirmar"}`).join(", ")}.`);
  } else if (COSTO_DOMICILIO) l.push(`Costo del domicilio: ${pesos(COSTO_DOMICILIO)}.`);
  if (PEDIDO_MINIMO) l.push(`Pedido mínimo para domicilio: ${pesos(PEDIDO_MINIMO)}.`);
  l.push(NEQUI ? "Formas de pago: efectivo al recibir o Nequi." : "Forma de pago: efectivo al recibir.");
  if (LOCAL) l.push(`También se puede recoger en el local: ${LOCAL}.`);
  else l.push("Solo domicilios (no hay para recoger).");
  if (ABRE != null && CIERRA != null) l.push(`Horario: de ${fmtHora(ABRE)} a ${fmtHora(CIERRA)}.`);
  if (SALSAS.incluidas?.length) l.push(`Salsas incluidas gratis: ${SALSAS.incluidas.join(", ")}.`);
  if (INFORMACION) l.push(INFORMACION);
  return l.join("\n");
}

function promptSistema() {
  const productos = Object.entries(PRODUCTOS)
    .map(([id, p]) => {
      let linea = `- ${id}: ${p.nombre} (${pesos(p.precio)})`;
      if (p.opciones?.length) linea += ` | opciones: ${p.opciones.join(", ")}`;
      if (p.detalle) linea += ` | ${p.detalle}`;
      if (agotados.has(id)) linea += " | AGOTADO HOY: no lo ofrezcas";
      return linea;
    })
    .join("\n");
  return `Eres el asistente de pedidos por WhatsApp de ${MARCA}: ${DESCRIPCION_NEGOCIO}.
Tu meta: que el cliente pida fácil y rápido y se sienta bien atendido.
Tono: amiguero, cálido y cercano, colombiano neutro, sin jerga paisa. Frases cortas (máximo 2 líneas) y máximo 1 emoji.
Los clientes escriben con errores, abreviaturas o por nota de voz mal transcrita: interpreta con sentido común (diminutivos como "una salchipapita" = una salchipapa; barrios mal escritos; "una coca" = una Coca-Cola).

PRODUCTOS (usa SOLO estos id):
${productos}
Reglas de productos:
${REGLAS_PRODUCTOS ? REGLAS_PRODUCTOS + "\n" : ""}- Si no dice la cantidad, pregúntala (falta_aclarar = true).
- Si el producto tiene opciones, pon la elegida en "nota" (ej: "Coca-Cola"). Varias opciones del mismo producto = una línea por opción (2 de Coca-Cola y 1 de manzana = dos líneas).
- "nota" también sirve para indicaciones de ese producto (ej: "bien doraditas"). Si no hay, "".
- NUNCA repitas un producto en la lista: cada producto (con su nota) va UNA sola vez con la cantidad TOTAL (si tenía 5 de un producto y no las cambia, siguen siendo 5).
- Si pide algo que no vendemos, dilo con amabilidad y ofrece lo que hay.
- En Colombia "una gaseosa de 2000" o "una de tres mil" habla del PRECIO, no del tamaño: ofrécele la opción más parecida diciendo su precio de la lista (ej: "¿Te sirve la gaseosa personal de $3.500?") y pon falta_aclarar = true.

INFORMACIÓN DEL NEGOCIO (es lo único que sabes; no inventes nada más):
${infoNegocio()}

CAMPOS DEL JSON:
- intencion: "saludo" | "pedido" (pide o cambia productos, o da barrio, dirección, nombre, salsas o forma de pago) | "pregunta" | "confirmar" (acepta el resumen) | "cancelar" (ya no quiere el pedido) | "estado_pedido" (pregunta por un pedido ya confirmado: "¿ya viene?", "¿cuánto falta?") | "queja" (problema con un pedido ya hecho o entregado: demora excesiva, llegó frío, incompleto, equivocado, cobro mal; o molestia con el servicio) | "hablar_humano" (pide de forma clara hablar con una persona; OJO: "háblalo", "háblame", "qué hubo", "quiubo", "oe", "bien o qué" son SALUDOS colombianos, intencion = "saludo") | "agradecimiento" | "otro".
- productos: el pedido COMPLETO como debe quedar (lo del carrito actual + los cambios del cliente). Si en este mensaje no habla de productos, devuelve [].
- falta_aclarar: true solo si tu respuesta pregunta algo sobre los productos (cuál, cuántos o qué sabor).
- entrega: "recoger" si dice que pasa a recoger; "domicilio" si lo pide a domicilio; si no lo dice, "".
- barrio, direccion, nombre: lo que el cliente diga en ESTE mensaje; si no lo dice, "". La dirección es calle o carrera, número, casa o apto y referencias, sin el barrio.
- pago: "efectivo" o "nequi" si lo dice; si no, "".
- paga_con: con cuánto paga en efectivo, en pesos ("con 50", "billete de 50" = 50000; "exacto" = 0). Si no lo dice, null.
- salsas: qué salsas incluidas quiere, si lo dice (ej: "ají picante", "sin ají"); si no, "".
- notas: indicaciones generales del pedido (ej: "llamar al llegar", "timbre dañado"); si no, "".
- mostrar_menu: true si pide el menú, el catálogo, la carta, qué hay o precios.
- frustrado: true si se nota molesto, repite lo mismo, dice que no le entiendes o usa groserías.
- necesita_humano: true si pregunta algo que NO está en la información del negocio (ingredientes, alergias, facturas, pedidos para eventos, trabajo, proveedores, etc.).
- respuesta: texto corto para el cliente (saludar, responder, aclarar). Si saluda o charla ("¿cómo estás?"), responde en UNA frase corta y cálida. En saludos, charla y preguntas generales NO termines preguntando qué quiere pedir: el sistema agrega esa pregunta y el menú.
REGLAS DE LA RESPUESTA: nunca confirmes pedidos ni digas que va en camino; nunca digas totales ni sumes precios (eso lo hace el sistema); si mencionas el precio de UN producto, usa exactamente el de la lista; para mostrar todos los precios usa mostrar_menu; nunca inventes datos. Cuando el pedido avanza, la respuesta puede ser muy corta: el sistema pregunta dirección y pago, y arma el resumen.`;
}

function estadoParaModelo(c) {
  const l = [];
  l.push(`Carrito actual: ${c.carrito.length ? listaCarrito(c.carrito) : "vacío"}`);
  l.push(
    `Entrega: ${c.entrega} | Barrio: ${c.barrio || "sin dato"} | Dirección: ${
      c.direccion || (c.ubicacion ? "envió ubicación GPS" : "sin dato")
    } | Pago: ${c.pago || "sin dato"} | Salsas: ${c.salsas || "sin dato"}`
  );
  if (c.nombre) l.push(`Nombre del cliente: ${c.nombre}`);
  if (c.estado === "esperando_confirmacion") l.push("El cliente tiene un RESUMEN pendiente de confirmar.");
  if (c.pedido) l.push(`Pedido ya confirmado #${c.pedido.codigo}: ${c.pedido.lista} (${estadoLegible(c.pedido)}, hace ${minutosDesde(c.pedido.ts)} min).`);
  else if (c.pedidoAnterior) l.push(`Pedido anterior #${c.pedidoAnterior.codigo}: ${c.pedidoAnterior.lista} (${estadoLegible(c.pedidoAnterior)}).`);
  l.push(`Agotados hoy: ${[...agotados].map((id) => PRODUCTOS[id].nombre).join(", ") || "ninguno"}.`);
  return "ESTADO ACTUAL (lo maneja el sistema):\n" + l.join("\n");
}

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function leerRespuesta(o) {
  const texto = (v) => (typeof v === "string" ? v.trim() : "");
  let pagaCon = o?.paga_con;
  pagaCon = pagaCon === null || pagaCon === undefined || pagaCon === "" ? null : Number(pagaCon);
  if (!Number.isFinite(pagaCon)) pagaCon = null;
  return {
    intencion: INTENCIONES.includes(o?.intencion) ? o.intencion : "otro",
    productos: Array.isArray(o?.productos) ? o.productos : [],
    falta_aclarar: o?.falta_aclarar === true,
    entrega: ["domicilio", "recoger"].includes(o?.entrega) ? o.entrega : "",
    barrio: texto(o?.barrio),
    direccion: texto(o?.direccion),
    nombre: texto(o?.nombre),
    pago: ["efectivo", "nequi"].includes(o?.pago) ? o.pago : "",
    paga_con: pagaCon,
    salsas: texto(o?.salsas),
    notas: texto(o?.notas),
    mostrar_menu: o?.mostrar_menu === true,
    frustrado: o?.frustrado === true,
    necesita_humano: o?.necesita_humano === true,
    respuesta: texto(o?.respuesta),
  };
}

async function interpretar(c) {
  const mensajes = [
    { role: "system", content: promptSistema() },
    { role: "system", content: estadoParaModelo(c) },
    ...c.historial.slice(-12),
  ];
  const formatos = [
    { type: "json_schema", json_schema: { name: "respuesta_cruji", strict: true, schema: ESQUEMA } },
    { type: "json_object" },
    { type: "json_object" },
  ];
  let ultimoError;
  for (let intento = 0; intento < formatos.length; intento++) {
    const body = { model: GROQ_MODEL, temperature: 0.2, messages: mensajes, response_format: formatos[intento] };
    if (GROQ_MODEL.startsWith("openai/gpt-oss")) body.reasoning_effort = "low";
    try {
      const r = await axios.post("https://api.groq.com/openai/v1/chat/completions", body, {
        headers: { Authorization: `Bearer ${GROQ_API_KEY}` },
        timeout: 30000,
      });
      const contenido = String(r.data?.choices?.[0]?.message?.content || "").replace(/```json|```/g, "").trim();
      const objeto = contenido.match(/\{[\s\S]*\}/);
      return leerRespuesta(JSON.parse(objeto ? objeto[0] : contenido));
    } catch (e) {
      ultimoError = e;
      const status = e.response?.status;
      console.error(`Cerebro intento ${intento + 1} falló:`, JSON.stringify(e.response?.data || e.message));
      if (status === 429) {
        const espera = Math.min(Number(e.response?.headers?.["retry-after"]) * 1000 || 3000, 8000);
        await esperar(espera);
        continue;
      }
      // El modelo escribió bien pero sin el formato: se aprovecha su respuesta
      const generado = e.response?.data?.error?.failed_generation;
      if (typeof generado === "string" && generado.trim()) {
        const bloque = generado.match(/\{[\s\S]*\}/);
        if (bloque) {
          try {
            return leerRespuesta(JSON.parse(bloque[0]));
          } catch {
            /* sigue */
          }
        }
        const limpio = generado.replace(/["}\s]+$/, "").replace(/^["{\s]+/, "").trim();
        if (limpio) return leerRespuesta({ intencion: "otro", respuesta: limpio });
      }
    }
  }
  throw ultimoError;
}

// ======================= FLUJO DEL PEDIDO =======================
const PIDE_HUMANO =
  /(hablar con (alguien|una persona|un humano|un asesor|una asesora|el dueno|la duena|el encargado|la encargada)|\basesora?\b|\bhumano\b|\boperadora?\b|persona real|atencion al cliente)/;
const QUEJA_RAPIDA = /(no (me )?ha llegado|no llega|llego (frio|mal|incompleto)|me falto|reclamo|queja|me cobraron)/;
const PIDE_MENU = /(\bmenu\b|\bcatalogo\b|\bcarta\b|que (tienen|tienes|venden|vendes|hay)\b|\bprecios?\b)/;
const AFIRMACION =
  /^(si+|s|dale|listo|ok|okay|okey|oki|confirmo|confirmar|confirmado|de una|perfecto|correcto|asi es|eso|claro|va|vale|hagale|👍|✅|👌)( (por favor|porfa|gracias|senor|senora|confirmo|de una|dale))?$/;
const esAfirmacion = (t) => AFIRMACION.test(norm(t).replace(/[!¡.,;]+/g, "").trim());
// "No, gracias / así está bien / eso es todo / ya con eso"... en todas sus formas
const FRASE_FIN =
  "no|nop|nel|nones|listo|ya|ya esta|ya con eso|con eso|con eso esta bien|eso|eso es todo|eso seria todo|eso no mas|eso nomas|es todo|seria todo|nada|nada mas|solo eso|asi|asi esta bien|asi esta|asi no mas|asi nomas|asi estoy bien|por ahora no|no por ahora|no mas|no quiero mas|nada por ahora|seguir|sigamos|continuar|terminar|de resto nada|lo demas esta bien";
const FIN = new RegExp(`^(${FRASE_FIN})( (${FRASE_FIN}))*$`);
const RELLENO = /\b(gracias|muchas|muy|amable|por favor|porfa|senor|senora|senorita|amigo|amiga|mijo|mija|vecino|vecina|joven|de verdad|la verdad|pues|entonces)\b/g;
const esNegacion = (t) => {
  const limpio = norm(t).replace(/[¿?¡!.,;👍🙏😊🙂]+/gu, " ").replace(RELLENO, " ").replace(/\s+/g, " ").trim();
  return limpio === "" ? /gracias/.test(norm(t)) : FIN.test(limpio);
};
// Incluye la jerga colombiana: "háblalo", "qué hubo", "oe", "bien o qué"... (son saludos, NO "quiero hablar con alguien")
const PALABRA_SALUDO =
  "hola+|holi+|ola+|buenas+|buenos dias|buen dia|buenas tardes|buenas noches|hey+|que mas|q mas|quiubo|quibo|quihubo|que hubo|q hubo|quiubole|epa|saludos|hablalo|hablame|habla pues|habla|oe+|oee+|ole|alo|que hay|que se dice|que cuenta|que cuentas|bien o que|bueno o que|que hace|que haces";
const EXTRA_SALUDO = `como (estas|esta|vas|va|amaneciste|le va|te va)|que tal|todo bien|vecino|vecina|amigo|amiga|senor|senora|joven|don|dona|muchachos|chicos|parce|parcero|parcera|mor|socio|mijo|mija|pues|ve|bro|cruji${
  MARCA ? "|" + MARCA.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9ñ ]/g, "") : ""
}`;
const SALUDO = new RegExp(`^(${PALABRA_SALUDO})( (${PALABRA_SALUDO}|${EXTRA_SALUDO}))*$`);
const esSaludo = (t) => SALUDO.test(norm(t).replace(/[¿?¡!.,;👋😊🙂]+/gu, " ").replace(/\s+/g, " ").trim());
const MENU_RECIENTE = 30 * MIN;

function primerNombre(c) {
  const p = String(c.nombre || "").trim().split(/\s+/)[0] || "";
  return /^\p{L}{2,15}$/u.test(p) ? p.charAt(0).toUpperCase() + p.slice(1).toLowerCase() : "";
}

// Un saludo nunca se queda en "hola": lleva directo al pedido
async function saludar(c) {
  const nombre = primerNombre(c);
  const hola = `¡Hola${nombre ? ", " + nombre : ""}! 👋`;
  const p = c.pedido;
  if (p && ["recibido", "en_camino"].includes(p.estado)) {
    const estado = p.estado === "en_camino" ? "ya va en camino 🛵" : `está en cocina 👩‍🍳 (lleva ${minutosDesde(p.ts)} min)`;
    return responder(c, `${hola} Tu pedido #${p.codigo} ${estado}. ¿Te ayudo con algo más?`);
  }
  if (c.estado === "esperando_confirmacion") return enviarResumen(c, `${hola} Tu pedido está listo para confirmar 👇\n\n`);
  if (c.carrito.length) {
    const sigo = `${hola} Seguimos con tu pedido: ${listaCarrito(c.carrito)} 😊`;
    if (c.paso === "aclarar") return responder(c, `${sigo}\n${RECORDATORIO_PASO.aclarar}`);
    return siguientePaso(c, null, [sigo]);
  }
  if (!c.menuEnviado || ahora() - c.menuEnviado > MENU_RECIENTE) {
    await memeAntes(c, c.pedidoAnterior ? "cliente_que_vuelve" : "saludo", PAUSA_SALUDO); // la pausa solo si salió meme
    return enviarMenu(c, CORTO ? `${hola} Estás en ${MARCA} ${EMOJI}` : `${hola} Te damos la bienvenida a ${MARCA} ${EMOJI}${LEMA ? " " + LEMA : ""}`);
  }
  return responder(c, `${hola} ¿Qué se te antoja hoy? 😊 (Si quieres ver el menú otra vez, escribe *menú*)`);
}

const FLUJO = new Set(["telefono", "tipo", "aclarar", "opcion", "mas", "minimo", "bebida", "direccion", "ubicacion", "pago", "cambio"]);
const RECORDATORIO_PASO = {
  mas: "¿Algo más? Si ya está, dime *no, gracias* y seguimos 😊",
  direccion: "Cuando puedas, me pasas la dirección 🏠",
  ubicacion: "Si puedes, me mandas tu ubicación 📍 (si no, dime y seguimos)",
  pago: "Y me cuentas cómo vas a pagar 💵",
  opcion: "Y me dices de qué sabor 😊",
  aclarar: "Y me confirmas qué productos quieres 😊",
  tipo: "Y me dices cuál quieres 😊",
  telefono: "Y si puedes, me pasas tu celular para el domiciliario 📱",
};

// ---------- "Una salchi" sin decir cuál: preguntar con botones ----------
const NUM_PALABRA = { un: 1, una: 1, uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10 };
const conPalabraTipo = (n) => PALABRAS_TIPO.some((w) => new RegExp(`(^|[^a-zñ])${w}([^a-zñ]|$)`).test(n));
function pideSinTipo(texto) {
  if (!TIPOS.length) return false;
  const n = norm(texto);
  if (!conPalabraTipo(n)) return false;
  // ¿Dijo cuál? ("sencilla", "de lomo", "chorizo"...)
  return !TIPOS.some((id) => {
    const p = PRODUCTOS[id];
    return [p.nombre, p.corto, ...(p.alias || [])].some((a) => {
      const x = norm(a);
      return x && !PALABRAS_TIPO.includes(x) && n.includes(x);
    });
  });
}
function cantidadDicha(texto) {
  if (!PALABRAS_TIPO.length) return null;
  const m = norm(texto).match(new RegExp(`(\\d+|${Object.keys(NUM_PALABRA).join("|")})\\s+(?:${PALABRAS_TIPO.join("|")})(?![a-zñ])`));
  if (!m) return null;
  const v = /^\d+$/.test(m[1]) ? Number(m[1]) : NUM_PALABRA[m[1]];
  return v > 0 && v <= 50 ? v : null;
}
// Botón corto: "Salchipapa de lomo" → "Lomo $12.000" (se quita lo que todos tienen en común)
const PREFIJO_TIPO = (() => {
  const nombres = TIPOS.map((id) => String(PRODUCTOS[id].corto || PRODUCTOS[id].nombre).split(/\s+/));
  let k = 0;
  while (nombres.length > 1 && nombres.every((w) => w.length > k + 1 && norm(w[k]) === norm(nombres[0][k]))) k++;
  return k;
})();
function tituloTipo(id) {
  let w = String(PRODUCTOS[id].corto || PRODUCTOS[id].nombre).split(/\s+/).slice(PREFIJO_TIPO);
  if (w.length > 1 && /^(de|con|del)$/i.test(w[0])) w = w.slice(1);
  const t = w.join(" ");
  return cortar(`${t.charAt(0).toUpperCase() + t.slice(1)} ${pesos(PRODUCTOS[id].precio)}`, 20);
}
async function preguntarTipo(c, pre = "", cantidad = null) {
  const disponibles = TIPOS.filter((id) => !agotados.has(id));
  if (!disponibles.length) return false;
  if (c.paso === "tipo") c.pasoVeces++;
  else {
    c.paso = "tipo";
    c.pasoVeces = 1;
  }
  if (c.pasoVeces >= 3) return false; // ya se le preguntó: que la IA le explique con sus palabras
  c.cantidadPendiente = cantidad;
  await memeAntes(c, "aclarar");
  const texto = `${pre}${PREGUNTA_TIPO}`;
  recordar(c, "assistant", texto);
  await enviarBotones(
    c.num,
    texto,
    disponibles.map((id) => [`prod:${id}`, tituloTipo(id)]),
    `Escríbeme cuál: ${disponibles.map((id) => tituloTipo(id)).join(" / ")}`
  );
  return true;
}

function barrioCubierto(c) {
  if (!c.barrio) return null;
  if (!BARRIOS.length) return c.barrio;
  if (c.barrioAceptado && norm(c.barrio) === norm(c.barrioAceptado)) return c.barrio;
  const t = norm(c.barrio);
  return BARRIOS.find((b) => t === norm(b) || t.includes(norm(b))) || null;
}

function datosCompletos(c) {
  if (!c.carrito.length) return false;
  if (c.carrito.some((i) => PRODUCTOS[i.id].opciones?.length && !i.nota)) return false;
  if (c.entrega !== "recoger" && (!barrioCubierto(c) || (!c.direccion && !c.ubicacion) || domicilioDe(c).fuera)) return false;
  return Boolean(c.pago);
}

async function pregunta(c, paso, texto) {
  if (c.paso === paso) c.pasoVeces++;
  else {
    c.paso = paso;
    c.pasoVeces = 1;
  }
  if (c.pasoVeces >= 3) {
    return pasarAHumano(c, `El cliente no logra completar este paso del pedido: ${paso}`, {
      tipo: "pedido",
      mensaje: `Para no enredarte más, te paso ${CON_QUIEN} y te ayuda a terminar el pedido 🙌 Te escribe en unos minutos.`,
    });
  }
  return responder(c, texto);
}

function textoPago(c, total) {
  if (c.pago === "nequi") return "💜 Pago por Nequi";
  if (c.pagaCon === 0 || (c.pagaCon && c.pagaCon === total)) return "💵 Efectivo, pago exacto";
  if (c.pagaCon && c.pagaCon > total) return `💵 Efectivo: pagas con ${pesos(c.pagaCon)} (cambio ${pesos(c.pagaCon - total)})`;
  return "💵 Efectivo al recibir";
}
const textoEntrega = (c) =>
  c.entrega === "recoger"
    ? `🏪 Recoges en: ${LOCAL}`
    : `📍 ${c.barrio}${c.direccion ? " — " + c.direccion : ""}${c.ubicacion ? " (ubicación 📍 recibida)" : ""}`;

async function siguientePaso(c, r, avisos = []) {
  const pre = avisos.length ? avisos.join("\n") + "\n\n" : "";

  // "Quiero una salchi" (sin decir cuál): botones Sencilla / Lomo / Chorizo
  if (r?.falta_aclarar && c.ultimoTexto && pideSinTipo(c.ultimoTexto)) {
    const yaLleva = c.carrito.length ? eco(pre, listaCarrito(c.carrito)) : "";
    if (await preguntarTipo(c, pre + yaLleva, cantidadDicha(c.ultimoTexto))) return;
  }

  if (!c.carrito.length) {
    if (avisos.length) return enviarMenu(c, `${pre}¿Te provoca algo más? Mira lo que tenemos hoy 😊`);
    if (r?.mostrar_menu || !r?.respuesta) return enviarMenu(c, r?.respuesta || "¿Qué se te antoja? 😊");
    return pregunta(c, "productos", r.respuesta);
  }
  if (r?.falta_aclarar && r.respuesta) return pregunta(c, "aclarar", pre + r.respuesta);

  const sinOpcion = c.carrito.find((i) => PRODUCTOS[i.id].opciones?.length && !i.nota);
  if (sinOpcion) {
    const p = PRODUCTOS[sinOpcion.id];
    const textoOpcion = `${pre}Para ${sinOpcion.cantidad}x ${p.nombre}, ¿de cuál? Tenemos: ${p.opciones.join(", ")}`;
    // Sabores con un toque (lista); si la lista no sale, queda la pregunta escrita
    if (p.opciones.length >= 2 && p.opciones.length <= 10 && c.paso !== "opcion") {
      const cuerpo = `${pre}${CORTO ? `¿De cuál? 👇` : `Para ${sinOpcion.cantidad}x ${p.nombre}, ¿de cuál? 👇`}`;
      const r = await enviar(c.num, {
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: cortar(cuerpo, 1024) },
          action: { button: "Elegir", sections: [{ title: cortar(p.corto || p.nombre, 24), rows: p.opciones.map((o, i) => ({ id: `op:${sinOpcion.id}:${i}`, title: cortar(o, 24) })) }] },
        },
      });
      if (r.ok) {
        c.paso = "opcion";
        c.pasoVeces = 1;
        recordar(c, "assistant", textoOpcion);
        return r;
      }
    }
    return pregunta(c, "opcion", textoOpcion);
  }

  // Venía eligiendo de la lista: ofrecer agregar otra cosa antes de seguir
  if (c.desdeLista) {
    c.desdeLista = null;
    return preguntarAlgoMas(c, pre);
  }

  const lista = listaCarrito(c.carrito);
  const { subtotal } = calcular(c);
  const domicilio = c.entrega !== "recoger";

  if (domicilio && PEDIDO_MINIMO && subtotal < PEDIDO_MINIMO) {
    return pregunta(
      c,
      "minimo",
      `${pre}Llevas: ${lista} (${pesos(subtotal)}) ✅\nEl pedido mínimo para domicilio es ${pesos(PEDIDO_MINIMO)}, te faltan ${pesos(
        PEDIDO_MINIMO - subtotal
      )}. ¿Le agregamos algo? 😊${LOCAL ? `\nTambién puedes recogerlo en ${LOCAL}.` : ""}`
    );
  }

  if (!c.ofrecioBebida) {
    c.ofrecioBebida = true;
    const bebidas = IDS.filter((id) => esBebida(id) && !agotados.has(id));
    const yaTiene = c.carrito.some((i) => esBebida(i.id) || PRODUCTOS[i.id].incluyeBebida);
    if (bebidas.length && !yaTiene) {
      const nombres = bebidas
        .map((id) => {
          const n = PRODUCTOS[id].corto || PRODUCTOS[id].nombre;
          return n.charAt(0).toLowerCase() + n.slice(1);
        })
        .join(", ");
      await memeAntes(c, "bebida");
      const textoBebida = CORTO
        ? `${pre}${ecoUnaVez(c, pre, lista)}¿Algo de tomar? 🥤`
        : `${pre}${ecoUnaVez(c, pre, lista)}¿Le agregamos algo de tomar? 🥤 Tenemos ${nombres}.\nSi no, dime *no, gracias* y seguimos 😊`;
      c.paso = "bebida";
      c.pasoVeces = 0;
      recordar(c, "assistant", textoBebida);
      const rBebida = await enviarListaBebidas(c, textoBebida);
      if (rBebida.ok) return rBebida;
      // si la lista no se pudo enviar, queda la pregunta de texto (con los nombres)
      return pregunta(c, "bebida", `${pre}¿Le agregamos algo de tomar? 🥤 Tenemos ${nombres}. Si no, dime *no, gracias* 😊`);
    }
  }

  if (domicilio) {
    if (!c.barrio) {
      const llegamos = BARRIOS.length ? `\n(Llegamos a ${BARRIOS.join(", ")})` : "";
      if (c.ubicacion) return pregunta(c, "direccion", `${pre}¿Y en qué barrio es? 🏠${llegamos}`);
      return pregunta(c, "direccion", `${pre}${ecoUnaVez(c, pre, lista)}¿A dónde te lo llevamos? Dime el barrio, la dirección y una referencia 🏠${llegamos}`);
    }
    const cubierto = barrioCubierto(c);
    if (!cubierto) return barrioNoCubierto(c);
    c.barrio = cubierto;
    const dom = domicilioDe(c);
    if (dom.fuera) return barrioNoCubierto(c, `Su ubicación está a ${dom.km.toFixed(1).replace(".", ",")} km (más lejos que la tabla de tarifas)`);
    if (!c.direccion && !c.ubicacion) {
      return pregunta(
        c,
        "direccion",
        `${pre}¡Listo, ${cubierto}! ¿Me das la dirección exacta? (calle o carrera, número, casa o apto y una referencia). También puedes mandarme tu ubicación 📍`
      );
    }
    // Dirección "de referencia" (sin números, ej: "la tienda de doña Mari"): pedir ubicación una vez, sin obligar
    if (!c.ubicacion && !c.pidioUbicacion && c.direccion && !/\d/.test(c.direccion)) {
      c.pidioUbicacion = true;
      return pregunta(
        c,
        "ubicacion",
        `${pre}¡Anotado! 📍 Si puedes, mándame tu ubicación (en el clip 📎 → Ubicación) para que el domiciliario llegue sin perderse. Si no puedes, no hay problema 😊`
      );
    }
  }

  // Número oculto: pedir un celular para que el domiciliario pueda llamar (una vez, sin obligar)
  if (domicilio && !esTelefono(c.num) && !c.telefono && !c.pidioTelefono) {
    c.pidioTelefono = true;
    return pregunta(c, "telefono", `${pre}¿Me regalas tu número de celular? 📱 Es solo para que el domiciliario te pueda llamar si no encuentra la dirección.`);
  }

  if (!c.pago) {
    if (!c.preguntoPago) {
      c.preguntoPago = true;
      if (NEQUI) {
        // Botones: Nequi primero (es lo que más se usa)
        c.paso = "pago";
        c.pasoVeces = 1;
        const texto = `${pre}¿Cómo vas a pagar? 👇`;
        recordar(c, "assistant", texto);
        return enviarBotones(
          c.num,
          texto,
          [
            ["pago_nequi", "💜 Nequi"],
            ["pago_efectivo", "💵 Efectivo"],
          ],
          "Escríbeme *Nequi* o *efectivo* (y con cuánto pagas, para llevarte el cambio)"
        );
      }
      return pregunta(c, "pago", `${pre}El pago es en efectivo al recibir 💵 ¿Con cuánto pagas, para llevarte el cambio? (si es exacto, dime "exacto")`);
    }
    c.pago = "efectivo";
  }
  return enviarResumen(c, pre);
}

async function enviarResumen(c, pre = "") {
  const { domicilio, total, detalleDomicilio } = calcular(c);
  const esCambio = Boolean(c.pedido);
  let txt = `${pre}${esCambio ? `📝 Así quedaría tu pedido #${c.pedido.codigo} con el cambio:` : "📝 Este es tu pedido:"}\n`;
  txt += c.carrito.map((i) => `• ${i.cantidad}x ${nombreItem(i)} — ${pesos(PRODUCTOS[i.id].precio * i.cantidad)}`).join("\n");
  if (domicilio) txt += `\n• Domicilio${detalleDomicilio ? ` (${detalleDomicilio})` : ""} — ${pesos(domicilio)}`;
  txt += `\n*Total: ${pesos(total)}*`;
  txt += `\n${textoEntrega(c)}`;
  txt += `\n${textoPago(c, total)}`;
  if (c.salsas || (SALSAS_EN_RESUMEN && SALSAS.porDefecto)) txt += `\n🌶️ Salsas: ${c.salsas || SALSAS.porDefecto} (incluidas)`;
  if (c.notas) txt += `\n📝 ${c.notas}`;
  if (!esCambio) txt += `\n⏱️ ${c.entrega === "recoger" ? "Listo en" : "Llega en"} ${tiempoEntrega} aprox.`;
  txt += `\n\n¿Lo confirmo?`;
  c.estado = "esperando_confirmacion";
  c.resumenEnviado = ahora();
  c.recordoConfirmacion = false;
  c.paso = "resumen";
  c.pasoVeces = 0;
  recordar(c, "assistant", txt);
  if (c.pago !== "nequi" && c.pagaCon >= 100000 && c.pagaCon - total >= 50000 && !c.memeCambio) {
    c.memeCambio = true;
    await memeAntes(c, "cambio");
  }
  return enviarBotones(c.num, txt, BOTONES_RESUMEN);
}

const mapa = (u) => `https://maps.google.com/?q=${u.lat},${u.lng}`;

// Botones para cocina según cómo va el pedido (en vez de escribir /salio 7, /pagook 7...)
function botonesPedido(p) {
  if (!p) return [];
  const b = [];
  if (p.pago === "nequi" && !p.pagoVerificado && ["recibido", "en_camino"].includes(p.estado)) {
    b.push([`cmd:pagook:${p.codigo}`, "💜 Pago OK"], [`cmd:pagomal:${p.codigo}`, "❌ Pago no llegó"]);
  }
  if (p.estado === "recibido") b.push([`cmd:salio:${p.codigo}`, "🛵 Salió"]);
  else if (p.estado === "en_camino") b.push([`cmd:entregado:${p.codigo}`, "✅ Entregado"]);
  return b.slice(0, 3);
}
const enlaceCliente = (c) =>
  esTelefono(c.num)
    ? `wa.me/${c.num}`
    : c.telefono
    ? `📱 ${telLocal(c.telefono)} (número oculto en WhatsApp: respóndele por aquí con #${c.codigo} tu mensaje)`
    : `número oculto (respóndele por aquí: #${c.codigo} tu mensaje)`;
const telLocal = (num) => (num.startsWith("57") && num.length === 12 ? `${num.slice(2, 5)} ${num.slice(5, 8)} ${num.slice(8)}` : num);

// Tarjeta lista para reenviar al domiciliario
function textoDomiciliario(p, c, actualizado = false) {
  let t = `🛵 DOMICILIO #${p.codigo}${actualizado ? " (ACTUALIZADO)" : ""} — ${MARCA}\n`;
  t += esTelefono(c.num)
    ? `👤 ${c.nombre || "Cliente"} — ${telLocal(c.num)}\n💬 wa.me/${c.num}\n`
    : c.telefono
    ? `👤 ${c.nombre || "Cliente"} — 📞 ${telLocal(c.telefono)}\n`
    : `👤 ${c.nombre || "Cliente"} — sin teléfono (no lo quiso dar; si hace falta, escríbele tú con #${c.pedido?.codigo || c.codigo} texto)\n`;
  t += `📍 ${p.barrio}${p.direccion ? " — " + p.direccion : ""}\n`;
  t += p.ubicacion ? `🗺️ ${mapa(p.ubicacion)}\n` : "🗺️ Sin ubicación GPS: si no encuentras, llama al cliente\n";
  if (p.pago === "nequi") t += `💜 Pago por Nequi (${pesos(p.total)}): NO cobrar. Sal solo cuando cocina confirme el pago\n`;
  else {
    t += `💵 Cobrar: ${pesos(p.total)}`;
    if (p.pagaCon > p.total) t += ` (paga con ${pesos(p.pagaCon)} → cambio ${pesos(p.pagaCon - p.total)})`;
    t += "\n";
  }
  if (p.notas) t += `📝 ${p.notas}\n`;
  return t.trim();
}

function textoCocina(p, anterior, c) {
  const enc = anterior ? `✏️ CAMBIO EN PEDIDO #${p.codigo}` : `🔔 PEDIDO #${p.codigo} — ${MARCA}`;
  let t = `${enc}\n👤 ${c.nombre || "Cliente"} — ${enlaceCliente(c)}\n`;
  t += p.entrega === "recoger" ? "🏪 RECOGE EN EL LOCAL\n" : `📍 ${p.barrio}${p.direccion ? " — " + p.direccion : ""}\n`;
  if (p.ubicacion) t += `🗺️ ${mapa(p.ubicacion)}\n`;
  t += p.items.map((i) => `• ${i.cantidad}x ${nombreItem(i)}`).join("\n") + "\n";
  if (p.salsas) t += `🌶️ ${p.salsas}\n`;
  if (p.notas) t += `📝 ${p.notas}\n`;
  t += p.domicilio ? `Subtotal ${pesos(p.subtotal)} + domicilio ${pesos(p.domicilio)}\n` : "";
  t += `TOTAL: ${pesos(p.total)}\n`;
  if (p.pago === "nequi") t += `💜 NEQUI — ⚠️ cocina ya, pero NO despaches hasta ver la plata en tu Nequi (/pagook ${p.codigo})\n`;
  else if (p.pagaCon === 0 || p.pagaCon === p.total) t += "💵 Efectivo — pago exacto\n";
  else if (p.pagaCon > p.total) t += `💵 Efectivo — paga con ${pesos(p.pagaCon)} → llevar cambio de ${pesos(p.pagaCon - p.total)}\n`;
  else t += "💵 Efectivo — no dijo con cuánto paga (lleva cambio)\n";
  if (unidades(p.items) >= 30) t += `⚠️ Pedido grande: ${unidades(p.items)} unidades\n`;
  if (anterior) t += `\n(Antes: ${anterior.lista} — ${pesos(anterior.total)})\n`;
  t += `\nCuando salga: /salio ${p.codigo}`;
  if (p.entrega !== "recoger") t += `\n👇 El siguiente mensaje es para reenviar al domiciliario`;
  return t;
}

async function confirmarPedido(c) {
  if (!datosCompletos(c)) {
    c.estado = "armando";
    return siguientePaso(c, null);
  }
  const anterior = c.pedido && c.pedido.estado === "recibido" ? c.pedido : null;
  if (anterior && ahora() - anterior.ts > T.cambios) {
    const pedido = listaCarrito(c.carrito);
    restaurarDesdePedido(c);
    return pasarAHumano(c, `Quiere cambiar el pedido #${anterior.codigo} (que ya se está preparando) a: ${pedido}`, {
      tipo: "pedido",
      mensaje: `Tu pedido ya se está preparando 👩‍🍳 Le paso el cambio ${A_QUIEN} para ver si alcanzamos. Te confirma en unos minutos.`,
    });
  }
  const { subtotal, domicilio, total } = calcular(c);
  const codigo = anterior ? anterior.codigo : codigoParaPedidoNuevo(c);
  c.pedido = {
    codigo,
    items: c.carrito.map((i) => ({ ...i })),
    lista: listaCarrito(c.carrito),
    subtotal,
    domicilio,
    total,
    entrega: c.entrega,
    barrio: c.barrio,
    direccion: c.direccion,
    ubicacion: c.ubicacion,
    pago: c.pago,
    pagaCon: c.pagaCon,
    salsas: c.salsas || SALSAS.porDefecto || "",
    notas: c.notas,
    ts: anterior ? anterior.ts : ahora(),
    estado: "recibido",
    alertado: false,
    actualizado: ahora(),
    comprobante: anterior ? anterior.comprobante : Boolean(c.comprobantePrevio),
    pagoVerificado: anterior ? anterior.pagoVerificado && anterior.total === total : false,
  };
  c.comprobantePrevio = false;
  c.estado = "confirmado";
  c.paso = "";
  c.pasoVeces = 0;
  c.fallos = 0;

  let msg;
  if (anterior) {
    msg = `¡Listo, actualicé tu pedido #${codigo}! ✅ Nuevo total: ${pesos(total)}`;
    if (c.pago === "nequi" && total !== anterior.total) msg += `\nRecuerda que por Nequi el total ahora es ${pesos(total)} 💜`;
  } else {
    msg =
      c.entrega === "recoger"
        ? `¡Confirmado! 🎉 Tu pedido #${codigo} ya está en cocina. Estará listo en ${tiempoEntrega} aprox. en ${LOCAL}. Te aviso cuando esté listo 😊`
        : CORTO
        ? `¡Confirmado! 🎉 Pedido #${codigo} en cocina. Llega en ${tiempoEntrega} aprox 🛵`
        : `¡Confirmado! 🎉 Tu pedido #${codigo} ya está en cocina. Llega en ${tiempoEntrega} aprox. Te aviso cuando salga 🛵`;
    if (c.pago === "nequi") msg += `\n\n💜 Transfiere ${pesos(total)} al Nequi *${NEQUI}*${NEQUI_TITULAR ? ` (a nombre de ${NEQUI_TITULAR})` : ""} y mándame el pantallazo por aquí 📸`;
  }
  // Cocina primero (no se demora por el meme), luego meme y el mensaje concreto al cliente
  await avisarEquipo(textoCocina(c.pedido, anterior, c), EQUIPO, botonesPedido(c.pedido));
  if (c.pedido.entrega !== "recoger") await avisarEquipo(textoDomiciliario(c.pedido, c, Boolean(anterior)));
  if (!anterior) await memeAntes(c, "confirmado");
  await responder(c, msg);
}

function restaurarDesdePedido(c) {
  const p = c.pedido;
  if (!p) return;
  Object.assign(c, {
    carrito: p.items.map((i) => ({ ...i })),
    entrega: p.entrega,
    barrio: p.barrio,
    direccion: p.direccion,
    ubicacion: p.ubicacion,
    pago: p.pago,
    pagaCon: p.pagaCon,
    salsas: p.salsas,
    notas: p.notas,
    estado: "confirmado",
  });
}

async function cancelarPorCliente(c, r) {
  if (!c.pedido) {
    if (!c.carrito.length) return responder(c, r?.respuesta || "¡Listo! 😊 Si se te antoja algo, aquí estoy.");
    Object.assign(c, { carrito: [], estado: "armando", paso: "", pasoVeces: 0, ofrecioBebida: false, ofrecioCompartir: false, preguntoPago: false, pidioUbicacion: false });
    await memeAntes(c, "cancelado");
    await responder(c, "Listo, no te tomo el pedido 👍 Si se te antoja algo más tarde, aquí estoy 😊");
    return;
  }
  const p = c.pedido;
  if (p.estado === "recibido" && ahora() - p.ts <= T.cambios) {
    p.estado = "cancelado";
    p.actualizado = ahora();
    await avisarEquipo(`❌ CANCELADO pedido #${p.codigo} (${p.lista}).\nEl cliente lo canceló: NO lo prepares.`);
    await memeAntes(c, "cancelado");
    await responder(c, `Listo, cancelé tu pedido #${p.codigo} 👍 Si se te antoja algo más tarde, aquí estoy 😊`);
    return;
  }
  return pasarAHumano(c, `Quiere cancelar el pedido #${p.codigo}, que ya ${p.estado === "en_camino" ? "salió" : "se está preparando"}`, {
    tipo: "pedido",
    mensaje: `Tu pedido ya ${p.estado === "en_camino" ? "va en camino 🛵" : "se está preparando 👩‍🍳"} Le paso tu mensaje ${A_QUIEN} para ver qué podemos hacer. Te escribe en unos minutos.`,
  });
}

const estadoLegible = (p) =>
  ({ recibido: "en cocina", en_camino: "en camino", entregado: "entregado", cancelado: "cancelado" }[p?.estado] || p?.estado);

async function responderEstado(c) {
  const p = c.pedido;
  const min = minutosDesde(p.ts);
  if (p.estado === "en_camino") return responder(c, `¡Tu pedido #${p.codigo} ya va en camino! 🛵 Llega en unos minutos.`);
  if (p.estado === "cancelado") return responder(c, `Tu pedido #${p.codigo} fue cancelado. Si quieres, te tomo uno nuevo 😊`);
  if (min < minutosMaximosEntrega()) {
    return responder(c, `Tu pedido #${p.codigo} está en cocina 👩‍🍳 (lleva ${min} min). Te aviso apenas ${p.entrega === "recoger" ? "esté listo" : "salga"} 🛵`);
  }
  return pasarAHumano(c, `Pregunta por su pedido #${p.codigo}: lleva ${min} min y no ha salido`, {
    tipo: "queja",
    mensaje: `Perdón por la demora 🙏 Ya le estoy preguntando a cocina por tu pedido #${p.codigo} y te escriben ya mismo.`,
  });
}

async function barrioNoCubierto(c, porDistancia = "") {
  const b = c.barrio;
  const codigo = codigoDe(c);
  const recoger = LOCAL ? `\nSi prefieres, también puedes recogerlo en ${LOCAL}.` : "";
  return pasarAHumano(c, porDistancia || `Barrio fuera de cobertura: ${b}`, {
    tipo: "pedido",
    mensaje: porDistancia
      ? `Tu ubicación queda un poco lejos de nuestra zona 😅 pero déjame consultarlo: le paso tu pedido ${A_QUIEN} y te confirma en unos minutos si podemos llegar y cuánto sale el domicilio.${recoger}`
      : `Todavía no tenemos domicilio fijo en ${b} 😔 pero déjame consultarlo: le paso tu pedido ${A_QUIEN} y te confirma en unos minutos si podemos llegar.${recoger}`,
    extra: `Si sí llegan, escribe el valor del domicilio: /aceptar ${codigo} 4000`,
  });
}

// ======================= PASAR A UNA PERSONA =======================
// tipos: "persona" (pidió alguien), "consulta" (pregunta que el bot no sabe),
//        "queja" (problema), "pedido" (barrio, cambios fuera de tiempo, se enredó)
async function pasarAHumano(c, motivo, { tipo = "persona", mensaje, extra } = {}) {
  silenciarMemes(c, 120);
  const codigo = codigoDe(c);
  const t = ahora();
  const estaAbierto = abierto();
  c.humano = {
    desde: t,
    motivo,
    tipo,
    ultimoMsgCliente: t,
    ultimaRespuesta: null,
    esperandoDesde: t,
    recordatorios: 0,
    escalado: false,
    sinRecordatorios: !estaAbierto,
  };
  const msg =
    mensaje ||
    (estaAbierto
      ? `Te paso ${CON_QUIEN} para ayudarte mejor 🙌 Te escribe por aquí en unos minutos.`
      : `Ya le dejé tu mensaje ${A_QUIEN} 🙏 Te responde apenas pueda.`);
  await responder(c, msg);

  const ultimos = c.historial
    .filter((h) => h.role === "user")
    .slice(-4)
    .map((h) => `  “${cortar(h.content, 200)}”`)
    .join("\n");
  const p = c.pedido || c.pedidoAnterior;
  let aviso = `🙋 #${codigo} NECESITA UNA PERSONA\n👤 ${c.nombre || "Cliente"} — ${enlaceCliente(c)}\nMotivo: ${motivo}\n`;
  if (ultimos) aviso += `Últimos mensajes:\n${ultimos}\n`;
  if (p) aviso += `Pedido #${p.codigo}: ${p.lista} — ${pesos(p.total)} (${estadoLegible(p)}, hace ${minutosDesde(p.ts)} min)\n`;
  else if (c.carrito.length) aviso += `Lleva en el carrito: ${listaCarrito(c.carrito)}\n`;
  if (c.barrio) aviso += `Barrio: ${c.barrio}${c.direccion ? " — " + c.direccion : ""}\n`;
  aviso += `\nResponde: #${codigo} tu mensaje\nDevolver al bot: #${codigo} bot`;
  if (extra) aviso += `\n${extra}`;
  const botonesAviso = [[`cmd:bot:${codigo}`, "🤖 Devolver al bot"]];
  if (p?.pago === "nequi" && !p.pagoVerificado && ["recibido", "en_camino"].includes(p.estado)) botonesAviso.unshift([`cmd:pagook:${p.codigo}`, "💜 Pago OK"]);
  await avisarEquipo(aviso, COCINA ? [COCINA] : EQUIPO, botonesAviso);
}

async function revisarPersonas() {
  const t = ahora();
  for (const c of clientes.values()) {
    const h = c.humano;
    if (!h) continue;
    const ultimo = Math.max(h.desde, h.ultimoMsgCliente || 0, h.ultimaRespuesta || 0);
    if (t - ultimo > T.liberarPersona) {
      liberarDeHumano(c);
      continue;
    }
    if (!h.esperandoDesde || h.sinRecordatorios) continue;
    const espera = t - h.esperandoDesde;
    const min = minutosDesde(h.esperandoDesde);

    // 1er recordatorio (5 min): al cliente y a todo el equipo
    if (h.recordatorios === 0 && espera >= T.esperaPersona) {
      h.recordatorios = 1;
      h.escalado = true;
      await responder(c, `Sigues en mi lista 🙏 Ya le avisé de nuevo ${A_QUIEN}, ya casi te responde.`);
      await avisarEquipo(`⏰ #${c.codigo} lleva ${min} min esperando respuesta (${h.motivo}).\nResponde: #${c.codigo} tu mensaje · o devuélvelo al bot: #${c.codigo} bot`);
      continue;
    }
    // 2º (10 min): no dejar al cliente en el aire
    if (h.recordatorios === 1 && espera >= 2 * T.esperaPersona) {
      h.recordatorios = 2;
      if (h.tipo === "consulta" || h.tipo === "persona") {
        liberarDeHumano(c);
        await responder(c, `Perdón la espera 🙏 Mientras te responden, te sigo atendiendo yo: si quieres pedir, dime qué se te antoja 😊`);
        await avisarEquipo(`⏰ #${c.codigo} lleva ${min} min sin respuesta. El bot volvió a atenderlo, pero su pregunta sigue pendiente: #${c.codigo} tu mensaje`);
      } else {
        await responder(
          c,
          `Perdón la espera 🙏 Tu caso está marcado como prioritario y te responden apenas se libere alguien.${TELEFONO ? ` Si es urgente, llámanos al ${TELEFONO}.` : ""}`
        );
        await avisarEquipo(`🚨 #${c.codigo} lleva ${min} min SIN RESPUESTA (${h.motivo}).\nResponde: #${c.codigo} tu mensaje`);
      }
      continue;
    }
    // 3º (20 min): último aviso al equipo
    if (h.recordatorios === 2 && espera >= 4 * T.esperaPersona) {
      h.recordatorios = 3;
      await avisarEquipo(`🚨 #${c.codigo} lleva ${min} min esperando. Si nadie responde en 10 min, el bot retoma la conversación.`);
    }
  }
}

function liberarDeHumano(c) {
  c.humano = null;
  if (c.barrio && !barrioCubierto(c)) c.barrio = "";
  c.paso = "";
  c.pasoVeces = 0;
  c.fallos = 0;
}

// ======================= TURNO DEL CLIENTE =======================
async function procesarTurno(c, entrada) {
  reiniciarSiHaceFalta(c);
  const t = ahora();
  c.ultimaActividad = t;
  const texto = String(entrada.texto || "").trim();
  if (texto && !entrada.yaRecordado) recordar(c, "user", texto);
  c.ultimoTexto = texto;

  // A) Conversación en manos de una persona: el bot solo reenvía
  if (c.humano) {
    const h = c.humano;
    h.ultimoMsgCliente = t;
    if (!h.esperandoDesde) {
      h.esperandoDesde = t;
      h.recordatorios = 0;
    }
    // Lo que el cliente escribe y nadie le ha contestado: si devuelven el chat al bot, el bot lo responde
    if (texto) h.sinResponder = [...(h.sinResponder || []), texto].slice(-5);
    const destinos = h.escalado || !COCINA ? EQUIPO : [COCINA];
    await avisarEquipo(`💬 #${c.codigo} ${c.nombre || ""}: ${texto || "(mensaje)"}\nResponde: #${c.codigo} tu mensaje`, destinos);
    return;
  }

  const n = norm(texto);

  // B) Cerrado (si no tiene un pedido en curso)
  if (!abierto() && !c.pedido) {
    if (QUEJA_RAPIDA.test(n) || PIDE_HUMANO.test(n)) {
      return pasarAHumano(c, "Mensaje fuera de horario", {
        tipo: "queja",
        mensaje: `Ahora estamos cerrados, pero ya le dejé tu mensaje ${A_QUIEN} 🙏 Te responde apenas pueda.`,
      });
    }
    if (t - c.avisoCerrado > 10 * MIN) {
      c.avisoCerrado = t;
      await memeAntes(c, "cerrado");
      await responder(c, mensajeCerrado());
    }
    return;
  }

  // C) Atajos sin IA (más rápidos y seguros)
  if (entrada.boton === "humano" || PIDE_HUMANO.test(n)) return pasarAHumano(c, "Pidió hablar con una persona", { tipo: "persona" });

  // Eligió de la lista o tocó un botón de tipo: se anota de una (la cantidad que ya dijo, o 1) y se pregunta "¿Algo más?"
  if (entrada.producto) {
    const id = entrada.producto;
    if (agotados.has(id)) {
      await memeAntes(c, "agotado");
      return responder(c, `Uy, hoy se nos acabó ${PRODUCTOS[id].nombre} 😔 ¿Te provoca otra cosa?`);
    }
    // Negocios de "por docena" (pasteles, empanadas) prefieren preguntar cuántos; en menu.js: preguntarCuantosEnLista
    if (!c.cantidadPendiente && NEGOCIO.preguntarCuantosEnLista !== false) {
      const p = PRODUCTOS[id];
      const cuantos = /a$/i.test(String(p.nombre).split(/\s+/)[0]) ? "cuántas" : "cuántos";
      c.paso = "aclarar";
      c.pasoVeces = 0;
      c.desdeLista = id;
      if (c.estado === "esperando_confirmacion") c.estado = "armando";
      return responder(c, `¡Buena elección! 😋 ${p.nombre}: ¿${cuantos} quieres?${p.opciones?.length ? `\nY dime de cuál: ${p.opciones.join(", ")}` : ""}`);
    }
    const cantidad = c.cantidadPendiente || 1;
    c.cantidadPendiente = null;
    const previo = c.carrito.find((i) => i.id === id && !i.nota);
    if (previo) previo.cantidad += cantidad;
    else c.carrito.push({ id, cantidad, nota: "" });
    c.desdeLista = id;
    c.paso = "";
    c.pasoVeces = 0;
    if (c.estado === "esperando_confirmacion") c.estado = "armando";
    recordar(c, "user", `[Anotó ${cantidad}x ${PRODUCTOS[id].nombre}]`);
    return siguientePaso(c, null, CORTO ? [] : ["¡Buena elección! 😋"]);
  }

  // Ubicación GPS: se aprovecha según el momento del pedido
  if (entrada.ubicacion && c.ubicacion) {
    const p = c.pedido;
    if (p && ["recibido", "en_camino"].includes(p.estado)) {
      p.ubicacion = c.ubicacion;
      await avisarEquipo(`📍 #${p.codigo} ${c.nombre || ""} envió su ubicación (reenvíasela al domiciliario):\n${mapa(c.ubicacion)}`);
      return responder(c, "¡Gracias! 📍 Ya le pasé tu ubicación al domiciliario 🛵");
    }
    if (c.carrito.length) {
      if (c.estado === "esperando_confirmacion") return enviarResumen(c, "¡Gracias! 📍 Ubicación recibida.\n\n");
      return siguientePaso(c, null, ["¡Gracias! 📍 Ubicación recibida."]);
    }
    return responder(c, "¡Gracias! 📍 Guardé tu ubicación para el domicilio. ¿Qué se te antoja hoy? 😊");
  }

  if (entrada.carritoCatalogo) {
    const { carrito: nuevos, quitados } = validarProductos(entrada.carritoCatalogo);
    if (nuevos.length) {
      // Se suma a lo que ya llevaba (por si pidió algo por chat antes de usar el carrito)
      const suma = new Map(c.carrito.map((i) => [`${i.id}|${norm(i.nota)}`, { ...i }]));
      for (const i of nuevos) {
        const k = `${i.id}|${norm(i.nota)}`;
        if (suma.has(k)) suma.get(k).cantidad += i.cantidad;
        else suma.set(k, { ...i });
      }
      c.carrito = [...suma.values()];
      c.estado = "armando";
      const avisos = [`¡Recibí tu carrito! 🛒 ${listaCarrito(c.carrito)}`];
      if (quitados.length) avisos.push(`Uy, hoy se nos acabó: ${quitados.join(", ")} 😔`);
      return siguientePaso(c, null, avisos);
    }
  }

  if (c.estado === "esperando_confirmacion") {
    if (entrada.boton === "confirmar" || esAfirmacion(texto)) return confirmarPedido(c);
    if (entrada.boton === "cambiar") {
      c.estado = "armando";
      c.paso = "cambio";
      return responder(c, "¡Claro! Dime qué quieres cambiar 😊 (productos, dirección, salsas o forma de pago)");
    }
  } else if (entrada.boton === "confirmar" || entrada.boton === "cambiar") {
    if (c.pedido) return responder(c, `Tu pedido #${c.pedido.codigo} ya está confirmado 😊 Si quieres cambiar algo, escríbeme qué.`);
    if (c.carrito.length) return siguientePaso(c, null);
  }

  // "¿Algo más?": botones o "no, gracias / eso es todo" siguen con el pedido sin gastar modelo
  if (entrada.boton === "mas_agregar") {
    c.paso = "mas";
    const r = await enviarLista(c, "Elige lo que quieras agregar 👇 (o escríbemelo)", "➕ Agregar algo");
    return r.ok ? r : enviarMenu(c, "Esto es lo que tenemos 😋");
  }
  if ((entrada.boton === "mas_fin" || (c.paso === "mas" && esNegacion(texto))) && c.estado === "armando" && c.carrito.length) {
    return siguientePaso(c, null);
  }
  if (entrada.boton === "mas_fin") {
    // Botón viejo: si ya hay resumen pendiente, se lo mostramos otra vez; si ya confirmó, se lo recordamos
    if (c.estado === "esperando_confirmacion") return enviarResumen(c);
    if (c.pedido) return responder(c, `Tu pedido #${c.pedido.codigo} ya está confirmado 😊`);
  }
  // Celular para el domiciliario (clientes con número oculto)
  if (c.paso === "telefono" && c.estado === "armando" && c.carrito.length) {
    const cel = soloDigitos(texto).replace(/^57(?=3\d{9}$)/, "");
    if (/^3\d{9}$/.test(cel)) {
      c.telefono = "57" + cel;
      return siguientePaso(c, null, ["¡Gracias! 📱 Anotado."]);
    }
    if (esNegacion(texto) || /prefiero no|no (lo )?quiero|no doy|sin numero|no tengo/.test(n)) return siguientePaso(c, null, ["Listo, sin problema 😊"]);
    if (/\d{7,}/.test(soloDigitos(texto)) && soloDigitos(texto).length <= 12) {
      return pregunta(c, "telefono", "Mmm, ese número no me cuadra 🤔 ¿Me lo pasas así: 3001234567? (si prefieres no darlo, dime *no*)");
    }
  }

  // Botones de pago
  if (entrada.boton === "pago_nequi" && c.carrito.length && NEQUI) {
    c.pago = "nequi";
    c.pagaCon = null;
    if (c.estado === "esperando_confirmacion") return enviarResumen(c, "Listo, por Nequi 💜\n\n");
    return siguientePaso(c, null);
  }
  if (entrada.boton === "pago_efectivo" && c.carrito.length) {
    c.pago = "efectivo";
    if (c.estado === "esperando_confirmacion") c.estado = "armando";
    return pregunta(c, "pago", `¡Listo! 💵 ¿Con cuánto pagas, para llevarte el cambio? (si es exacto, dime "exacto")`);
  }

  // Eligió un sabor de la lista (op:producto:número)
  if (String(entrada.boton || "").startsWith("op:") && c.carrito.length) {
    const [, pid, idx] = entrada.boton.split(":");
    const opcion = PRODUCTOS[pid]?.opciones?.[Number(idx)];
    const item = c.carrito.find((i) => i.id === pid && !i.nota);
    if (opcion && item) {
      item.nota = opcion;
      if (c.estado === "esperando_confirmacion") c.estado = "armando";
      recordar(c, "user", `[Eligió ${opcion}]`);
      return siguientePaso(c, null);
    }
  }
  // "No, gracias" desde la lista de bebidas
  if (entrada.boton === "bebida_no" && c.estado === "armando" && c.carrito.length) return siguientePaso(c, null);
  // "No, así está bien" después de ofrecer bebida: seguir sin gastar modelo
  if (c.paso === "bebida" && c.estado === "armando" && c.carrito.length && esNegacion(texto)) return siguientePaso(c, null);
  // "No tengo datos / no sé cómo" al pedir la ubicación: seguir sin ella
  if (c.paso === "ubicacion" && c.estado === "armando" && c.carrito.length && (esNegacion(texto) || /no (tengo|puedo|se|me deja|hay)|sin datos|despues|ahorita no/.test(n))) {
    return siguientePaso(c, null);
  }

  // Saludo puro ("hola", "buenas noches", "hola cómo estás"): directo a la acción, sin gastar modelo
  if (esSaludo(texto)) return saludar(c);

  // "menú", "qué tienen", "catálogo"... sin pedir nada más en el mismo mensaje
  if (PIDE_MENU.test(n) && n.split(" ").length <= 6 && !/\d/.test(n) && !buscarProducto(n)) return enviarMenu(c);

  // D) Entender con IA
  let r;
  try {
    r = await interpretar(c);
  } catch (e) {
    c.fallos++;
    console.error("Error en el cerebro:", JSON.stringify(e.response?.data || e.message));
    if (c.fallos >= 2) {
      return pasarAHumano(c, "El bot no logró entender (falla técnica)", {
        tipo: "persona",
        mensaje: `Perdón, se me están enredando los mensajes 😅 Te paso ${CON_QUIEN} para que te atienda.`,
      });
    }
    return responder(c, "Uy, no te entendí bien 😅 ¿Me lo repites con otras palabras?");
  }

  if (r.intencion === "hablar_humano") return pasarAHumano(c, "Pidió hablar con una persona", { tipo: "persona" });
  if (r.intencion === "queja") {
    return pasarAHumano(c, "Queja o problema con un pedido", {
      tipo: "queja",
      mensaje: `Qué pena contigo 😔 Ya le paso tu caso ${A_QUIEN} para solucionarlo. Te escribe en unos minutos.`,
    });
  }
  if (r.necesita_humano) {
    return pasarAHumano(c, "Pregunta que el bot no sabe responder", {
      tipo: "consulta",
      mensaje: `Esa te la responde mejor ${ENCARGADO || "alguien del equipo"} 🙌 Ya le pasé tu pregunta, te escribe en unos minutos.`,
    });
  }
  if (r.frustrado) {
    silenciarMemes(c);
    c.fallos++;
    if (c.fallos >= 2) {
      return pasarAHumano(c, "Cliente molesto o el bot no lo entiende", {
        tipo: "persona",
        mensaje: `Perdón si no te estoy entendiendo 🙏 Te paso ${CON_QUIEN} ya mismo.`,
      });
    }
  }
  if (r.intencion === "cancelar") return cancelarPorCliente(c, r);
  if (r.intencion === "estado_pedido" && c.pedido) return responderEstado(c);

  // E) Actualizar los datos del pedido
  const antes = huella(c);
  const avisos = [];
  // Con un pedido ya confirmado, solo se aceptan cambios si el cliente de verdad está pidiendo algo
  const puedeCambiar = !c.pedido || r.intencion === "pedido";
  if (!puedeCambiar) {
    r.productos = [];
    r.barrio = r.direccion = r.entrega = r.pago = r.salsas = r.notas = "";
    r.paga_con = null;
  }
  if (["agradecimiento", "saludo"].includes(r.intencion)) r.productos = [];
  // "Con cuánto paga" solo si el cliente lo dijo de verdad (evita un "pago exacto" inventado)
  if (r.paga_con === 0 && !/exact/.test(n)) r.paga_con = null;
  if (r.paga_con > 0 && !/\d|mil|billete|veinte|treinta|cuarenta|cincuenta|cien/.test(n)) r.paga_con = null;
  if (r.productos.length) {
    const { carrito, quitados } = validarProductos(r.productos);
    c.carrito = carrito;
    c.cantidadPendiente = null;
    if (quitados.length) {
      avisos.push(`Uy, hoy se nos acabó: ${quitados.join(", ")} 😔`);
      await memeAntes(c, "agotado");
    }
  }
  if (r.entrega === "recoger" && !LOCAL) avisos.push("Por ahora solo hacemos domicilios 🛵");
  else if (r.entrega) c.entrega = r.entrega;
  if (r.barrio) {
    if (norm(r.barrio) !== norm(c.barrio)) c.domicilioManual = null; // otro barrio: la tarifa especial ya no aplica
    c.barrio = r.barrio;
  }
  if (r.direccion) c.direccion = r.direccion;
  if (r.nombre) c.nombre = r.nombre;
  if (r.pago === "nequi" && !NEQUI) {
    avisos.push("Por ahora recibimos solo efectivo 🙏");
    c.pago = "efectivo";
  } else if (r.pago) c.pago = r.pago;
  if (r.paga_con !== null) c.pagaCon = r.paga_con > 0 && r.paga_con < 1000 ? r.paga_con * 1000 : r.paga_con;
  if (r.salsas) c.salsas = r.salsas;
  if (r.notas) c.notas = r.notas;
  const cambio = huella(c) !== antes;
  if (cambio) c.fallos = 0;

  // F) Ya hay un pedido confirmado
  if (c.pedido) {
    if (!cambio) {
      if (r.intencion === "agradecimiento") await memeAntes(c, "gracias");
      return responder(c, unir(avisos, r.respuesta || "¡Con gusto! 😊"));
    }
    if (c.pedido.estado !== "recibido" || t - c.pedido.ts > T.cambios) {
      const pedido = listaCarrito(c.carrito);
      const p = c.pedido;
      restaurarDesdePedido(c);
      return pasarAHumano(c, `Quiere cambiar el pedido #${p.codigo} (ya ${estadoLegible(p)}) a: ${pedido}`, {
        tipo: "pedido",
        mensaje: `Tu pedido ya ${p.estado === "en_camino" ? "va en camino 🛵" : "se está preparando 👩‍🍳"} Le paso el cambio ${A_QUIEN} para ver si alcanzamos. Te confirma en unos minutos.`,
      });
    }
    return siguientePaso(c, r, avisos);
  }

  // G) Menú, preguntas y charla
  if (r.mostrar_menu && !cambio) return enviarMenu(c, unir(avisos, r.respuesta || "¡Claro! Este es nuestro menú 😋"));
  const enFlujo = c.carrito.length > 0 && FLUJO.has(c.paso);
  const hablaDelPedido = cambio || ["pedido", "confirmar"].includes(r.intencion) || (enFlujo && !["pregunta", "saludo"].includes(r.intencion));
  if (!hablaDelPedido) {
    let msg = unir(avisos, r.respuesta || "¿En qué te ayudo? 😊");
    if (c.estado === "esperando_confirmacion") msg += "\n\n(Tu pedido sigue esperando que lo confirmes 😊)";
    else if (enFlujo && RECORDATORIO_PASO[c.paso] && !r.falta_aclarar && !/\?\s*$/.test(r.respuesta)) msg += `\n\n${RECORDATORIO_PASO[c.paso]}`; // una sola pregunta a la vez
    else if (!c.carrito.length && !c.pedido) {
      // Charla o pregunta sin pedido: responder corto y llevar a la acción
      if (!c.menuEnviado || ahora() - c.menuEnviado > MENU_RECIENTE) return enviarMenu(c, msg);
      msg += r.intencion === "pregunta" ? "\n\n¿Te anoto algo? 😊" : `\n\n¿Qué se te antoja hoy? ${EMOJI}`;
    }
    if (r.intencion === "agradecimiento" && !enFlujo) await memeAntes(c, "gracias");
    return responder(c, msg);
  }
  if (c.estado === "esperando_confirmacion" && !cambio && r.intencion === "confirmar") return confirmarPedido(c);
  return siguientePaso(c, r, avisos);
}

// ======================= COMANDOS DEL EQUIPO =======================
const AYUDA = () => `🤖 COMANDOS ${MARCA.toUpperCase()}
(Casi todo también está en botones: en cada aviso de pedido, y en el menú de cocina de abajo 👇. Para abrirlo cuando quieras: /menu)

#7 texto → le escribes al cliente #7 (el bot se pausa con él)
#7 bot → el bot vuelve a atender al #7
/salio 7 → le avisa al cliente que va en camino
/pagook 7 → viste la plata en tu Nequi: pago confirmado
/pagomal 7 → no llegó (o llegó incompleto): el bot le avisa con tacto y te pasa el chat
/entregado 7 → cierra el pedido
/cancelar 7 motivo → cancela y le avisa al cliente
/aceptar 7 4000 → sí llegan al barrio del #7, con ese valor de domicilio
/agotado ${PRODUCTOS[IDS[0]]?.corto || "producto"} · /hay ${PRODUCTOS[IDS[0]]?.corto || "producto"} → productos agotados
/demora 50 · /demora normal → tiempo de entrega
/cerrar · /abrir → pausar o reanudar pedidos
/pedidos → pedidos y clientes pendientes

⚠️ Escríbele algo al bot cada día (por ejemplo /abrir al empezar): WhatsApp solo deja que el bot te mande avisos si le escribiste en las últimas 24 horas.`;

// Menú de cocina con un toque (lo general; lo de cada pedido va en los botones del aviso)
async function enviarMenuCocina(a) {
  const r = await enviar(a, {
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: "🧑‍🍳 Menú de cocina: elige una acción 👇" },
      action: {
        button: "Ver acciones",
        sections: [
          { title: "Pedidos", rows: [{ id: "cmd:pedidos", title: "📋 Pedidos activos", description: "Cómo va cada pedido y cada pago" }] },
          {
            title: "Atención",
            rows: [
              { id: "cmd:abrir", title: "✅ Abrir pedidos" },
              { id: "cmd:cerrar", title: "🔒 Cerrar pedidos", description: "El bot deja de recibir pedidos nuevos" },
              { id: "cmd:demora:50", title: "⏱️ Hay demora (50 min)" },
              { id: "cmd:demora:normal", title: "⏱️ Tiempo normal" },
            ],
          },
          {
            title: "Productos",
            rows: [
              { id: "cmd:menuagotar", title: "🚫 Se acabó algo" },
              { id: "cmd:menuhay", title: "✅ Volvió a haber" },
            ],
          },
        ],
      },
    },
  });
  if (!r.ok) await enviarTexto(a, AYUDA());
  return r;
}
// Botón o fila tocada por cocina → el mismo comando escrito
function comandoDeBoton(id) {
  const [, cmd, x, y] = String(id).split(":");
  if (cmd === "bot") return `#${x} bot`;
  if ((cmd === "agotado" || cmd === "hay") && PRODUCTOS[x]) return `/${cmd} ${PRODUCTOS[x].nombre}`;
  return `/${[cmd, x, y].filter(Boolean).join(" ")}`;
}

async function comandoEquipo(a, texto) {
  const t = texto.trim();
  const responderA = (msg, botones = null) => (botones?.length ? enviarBotones(a, msg, botones, "") : enviarTexto(a, msg));

  // #7 mensaje / #7 bot
  const m = t.match(/^#\s*(\d+)\s*([\s\S]*)$/);
  if (m) {
    const c = clientePorCodigo(m[1]);
    if (!c) return responderA(`No encontré el #${m[1]}.`);
    const msg = m[2].trim();
    if (!msg) return responderA(`Escribe el mensaje después del número. Ej: #${m[1]} Hola, ya sale tu pedido`);
    if (norm(msg) === "bot") {
      const sinResponder = c.humano?.sinResponder || [];
      liberarDeHumano(c);
      silenciarMemes(c, 30); // acaba de hablar con una persona: sin chistes por un rato
      if (sinResponder.length) {
        // El cliente escribió algo que nadie contestó: el bot se lo responde de una
        await responderA(`🤖 El bot vuelve a atender al #${m[1]} y ya le responde lo último que escribió: “${cortar(sinResponder.join(" / "), 120)}”`);
        return encolar(c.num, () => turnoSeguro(c, { texto: sinResponder.join("\n"), yaRecordado: true }));
      }
      await responderA(`🤖 El bot vuelve a atender al #${m[1]}.`);
      // Sin nada pendiente: el bot retoma donde iba, sin dejar al cliente en el aire
      if (c.carrito.length && !c.pedido) return encolar(c.num, () => siguientePaso(c, null, ["Listo 😊 Sigo yo con tu pedido."]));
      return encolar(c.num, () => responder(c, `Aquí sigo yo para lo que necesites 😊${c.pedido ? "" : ` Si se te antoja algo, escríbeme ${EMOJI}`}`));
    }
    const r = await enviarTexto(c.num, msg);
    if (!r.ok) return responderA(`⚠️ No pude enviarle el mensaje al #${m[1]}. Si pasaron más de 24 h desde su último mensaje, WhatsApp no deja escribirle.`);
    recordar(c, "assistant", msg);
    if (!c.humano) {
      c.humano = { desde: ahora(), motivo: "El equipo tomó la conversación", tipo: "persona", ultimoMsgCliente: 0, recordatorios: 0, escalado: false, sinRecordatorios: false };
    }
    c.humano.ultimaRespuesta = ahora();
    c.humano.esperandoDesde = null;
    c.humano.recordatorios = 0;
    c.humano.sinResponder = []; // la persona ya le contestó
    return responderA(`✅ Enviado al #${m[1]}. Cuando termines: #${m[1]} bot`);
  }

  const [cmdCrudo, ...resto] = t.slice(1).trim().split(/\s+/);
  const cmd = norm(cmdCrudo);
  const arg = resto.join(" ").trim();
  const pedidoDe = (num) => {
    const c = clientePorCodigo(num);
    const p = c && (c.pedido?.codigo === Number(num) ? c.pedido : c.pedidoAnterior?.codigo === Number(num) ? c.pedidoAnterior : null);
    return { c, p };
  };

  switch (cmd) {
    case "ayuda":
    case "comandos":
      await responderA(AYUDA());
      return enviarMenuCocina(a);
    case "":
    case "menu":
    case "acciones":
      return enviarMenuCocina(a);
    case "menuagotar":
    case "menuhay": {
      const ids = cmd === "menuagotar" ? IDS.filter((i) => !agotados.has(i)) : [...agotados];
      if (!ids.length) return responderA(cmd === "menuhay" ? "✅ No hay nada agotado." : "Todo está agotado 😅");
      return enviar(a, {
        type: "interactive",
        interactive: {
          type: "list",
          body: { text: cmd === "menuagotar" ? "¿Qué se acabó? 🚫" : "¿Qué volvió a haber? ✅" },
          action: {
            button: "Elegir producto",
            sections: [{ title: "Productos", rows: ids.slice(0, 10).map((i) => ({ id: `cmd:${cmd === "menuagotar" ? "agotado" : "hay"}:${i}`, title: cortar(PRODUCTOS[i].corto || PRODUCTOS[i].nombre, 24) })) }],
          },
        },
      });
    }
    case "abrir":
      cerradoManual = false;
      return responderA(`✅ Abierto: el bot está tomando pedidos.${dentroDeHorario() ? "" : "\n(Ojo: estás fuera del horario de menu.js, así que el bot seguirá diciendo que está cerrado.)"}`);
    case "cerrar":
      cerradoManual = true;
      return responderA("🔒 Cerrado: el bot le dirá a los clientes nuevos que por ahora no hay pedidos. Los pedidos en curso siguen normales. Para reabrir: /abrir");
    case "agotado":
    case "hay": {
      const id = buscarProducto(arg);
      if (!id) return responderA(`No encontré "${arg}". Prueba con: ${IDS.map((i) => PRODUCTOS[i].corto || PRODUCTOS[i].nombre).join(", ")}`);
      if (cmd === "agotado") agotados.add(id);
      else agotados.delete(id);
      const lista = [...agotados].map((i) => PRODUCTOS[i].nombre).join(", ") || "ninguno";
      return responderA(`${cmd === "agotado" ? "🚫" : "✅"} ${PRODUCTOS[id].nombre}: ${cmd === "agotado" ? "agotado" : "disponible"}.\nAgotados ahora: ${lista}`);
    }
    case "demora": {
      if (!arg || norm(arg) === "normal") tiempoEntrega = TIEMPO_BASE;
      else tiempoEntrega = /^\d+$/.test(arg) ? `unos ${arg} minutos` : arg;
      return responderA(`⏱️ Tiempo de entrega para pedidos nuevos: ${tiempoEntrega}`);
    }
    case "pagook":
    case "pagobien": {
      const { c, p } = pedidoDe(arg.split(/\s+/)[0]);
      if (!p) return responderA(`No encontré el pedido #${arg}.`);
      p.pagoVerificado = true;
      p.actualizado = ahora();
      await memeAntes(c, "nequi");
      await enviarTexto(c.num, `✅ ¡Pago confirmado! Gracias 💜 ${p.estado === "en_camino" ? "Tu pedido ya va en camino 🛵" : "Tu pedido sigue en cocina y te aviso cuando salga 🛵"}`);
      return responderA(`✅ Pago del #${p.codigo} verificado (${pesos(p.total)}).${p.estado === "recibido" ? " Cuando salga, toca 🛵 Salió." : ""}`, botonesPedido(p));
    }
    case "pagomal": {
      const [num, ...motivo] = arg.split(/\s+/);
      const { c, p } = pedidoDe(num);
      if (!p) return responderA(`No encontré el pedido #${num}.`);
      p.pagoVerificado = false;
      p.actualizado = ahora();
      const razon = motivo.join(" ").trim();
      await pasarAHumano(c, `Pago por Nequi NO verificado del pedido #${p.codigo} (${pesos(p.total)})${razon ? `: ${razon}` : ""}`, {
        tipo: "pedido",
        mensaje: `Uy 😕 No vemos tu pago de ${pesos(p.total)} en nuestro Nequi${razon ? ` (${razon})` : ""}. ¿Lo revisas porfa? Si ya pagaste, mándame otra vez el comprobante 📸, o dime si prefieres pagar en efectivo al recibir. Tu pedido queda apartado mientras tanto 🙏`,
        extra: `Si ya llegó: /pagook ${p.codigo} · Si paga en efectivo, escríbele: #${c.codigo} listo, pagas en efectivo`,
      });
      return responderA(`❌ Le avisé al #${p.codigo} que el pago no aparece. El chat quedó contigo.`);
    }
    case "salio":
    case "listo": {
      const [numSalio, confirma] = arg.split(/\s+/);
      const { c, p } = pedidoDe(numSalio);
      if (!p) return responderA(`No encontré el pedido #${arg}.`);
      if (p.pago === "nequi" && !p.pagoVerificado && !/^(si|sí|ya)$/i.test(confirma || "")) {
        return responderA(
          `⚠️ El #${p.codigo} es por Nequi y el pago NO está verificado${p.comprobante ? " (mandó pantallazo, pero revisa tu app)" : " (ni siquiera mandó pantallazo)"}.\nRevisa tu Nequi: /pagook ${p.codigo}\nSi igual sale: /salio ${p.codigo} si`,
          [
            [`cmd:pagook:${p.codigo}`, "💜 Pago OK"],
            [`cmd:salio:${p.codigo}:si`, "🛵 Salir igual"],
          ]
        );
      }
      p.estado = "en_camino";
      p.actualizado = ahora();
      if (p.entrega !== "recoger") await memeAntes(c, "salio");
      const r = await enviarTexto(
        c.num,
        p.entrega === "recoger" ? `🎉 ¡Tu pedido #${p.codigo} ya está listo! Te esperamos en ${LOCAL}.` : `🛵 ¡Tu pedido #${p.codigo} ya va en camino! Llega en unos minutos.`
      );
      return responderA(r.ok ? `✅ Le avisé al cliente #${p.codigo} que va en camino.` : `⚠️ No pude avisarle al cliente #${p.codigo}.`, botonesPedido(p));
    }
    case "entregado": {
      const { c, p } = pedidoDe(arg);
      if (!p) return responderA(`No encontré el pedido #${arg}.`);
      p.estado = "entregado";
      p.actualizado = ahora();
      await memeAntes(c, esDeNoche() ? "entregado_noche" : "entregado");
      await enviarTexto(c.num, `¡Gracias por pedir en ${MARCA}! 💛 Que lo disfrutes. Cualquier cosa, aquí estamos.`);
      return responderA(`✅ Pedido #${p.codigo} entregado.`);
    }
    case "cancelar": {
      const [num, ...motivo] = arg.split(/\s+/);
      const { c, p } = pedidoDe(num);
      if (!p) return responderA(`No encontré el pedido #${num}.`);
      p.estado = "cancelado";
      p.actualizado = ahora();
      const razon = motivo.join(" ").trim();
      await enviarTexto(c.num, `Lo sentimos mucho 😔 Tuvimos que cancelar tu pedido #${p.codigo}${razon ? `: ${razon}` : "."} Si quieres, te tomamos otro pedido.`);
      return responderA(`❌ Pedido #${p.codigo} cancelado y el cliente ya sabe.`);
    }
    case "aceptar": {
      const [num, valorTxt] = arg.split(/\s+/);
      const c = clientePorCodigo(num);
      if (!c) return responderA(`No encontré el #${num}.`);
      if (!c.barrio) return responderA(`El #${num} no tiene barrio pendiente.`);
      const digitos = soloDigitos(valorTxt);
      const valor = digitos ? Number(digitos) * (digitos.length <= 2 ? 1000 : 1) : null; // "4" o "4000" = $4.000
      const sinValor = domicilioDe({ ...c, barrioAceptado: c.barrio, domicilioManual: null });
      if (valor == null && sinValor.fuera) return responderA(`Está fuera de la tabla de distancias: escribe el valor del domicilio. Ej: /aceptar ${num} 6000`);
      c.barrioAceptado = c.barrio;
      if (valor != null) c.domicilioManual = valor;
      const aplicado = domicilioDe(c).valor || 0;
      liberarDeHumano(c);
      await siguientePaso(c, null);
      return responderA(
        `✅ Aceptado ${c.barrio} para el #${num} con domicilio de ${aplicado ? pesos(aplicado) : "$0 (gratis)"}.${valor == null ? ` (Para otro valor: /aceptar ${num} 4000)` : ""} El bot sigue con su pedido.`
      );
    }
    case "pedidos": {
      const activos = [];
      const esperando = [];
      for (const c of clientes.values()) {
        if (c.pedido && ["recibido", "en_camino"].includes(c.pedido.estado)) {
          const pago = c.pedido.pago === "nequi" ? (c.pedido.pagoVerificado ? " 💜✅" : c.pedido.comprobante ? " 💜❓ por verificar" : " 💜⏳ sin pantallazo") : "";
          activos.push(`#${c.pedido.codigo} ${estadoLegible(c.pedido)} (${minutosDesde(c.pedido.ts)} min)${pago} — ${c.pedido.lista}`);
        }
        if (c.humano) esperando.push(`#${c.codigo} ${c.humano.esperandoDesde ? `esperando hace ${minutosDesde(c.humano.esperandoDesde)} min` : "atendido"} — ${c.humano.motivo}`);
      }
      return responderA(
        `📋 PEDIDOS ACTIVOS\n${activos.join("\n") || "Ninguno"}\n\n🙋 CON UNA PERSONA\n${esperando.join("\n") || "Ninguno"}\n\nAgotados: ${
          [...agotados].map((i) => PRODUCTOS[i].nombre).join(", ") || "ninguno"
        }\nTiempo de entrega: ${tiempoEntrega}\nEstado: ${abierto() ? "abierto ✅" : "cerrado 🔒"}`
      );
    }
    default:
      return responderA("No entendí ese comando. Escribe /ayuda");
  }
}

// ======================= REVISIONES PERIÓDICAS =======================
async function revisarPendientes() {
  await revisarPersonas();
  const t = ahora();
  for (const c of [...clientes.values()]) {
    // Resumen sin confirmar: un recordatorio
    if (c.estado === "esperando_confirmacion" && !c.humano && !c.recordoConfirmacion && t - c.resumenEnviado > T.recordarConfirmacion) {
      c.recordoConfirmacion = true;
      await memeAntes(c, "sin_confirmar");
      await enviarBotones(c.num, "¿Te confirmo el pedido? 😊 Está listo para pasar a cocina.", BOTONES_RESUMEN);
    }
    // Pedido que no ha salido: alerta a cocina
    const p = c.pedido;
    // Nequi sin pantallazo a los 10 min: un recordatorio al cliente
    if (p && p.pago === "nequi" && p.estado === "recibido" && !p.comprobante && !p.pagoVerificado && !p.recordoComprobante && !c.humano && t - p.ts > T.recordarConfirmacion) {
      p.recordoComprobante = true;
      await enviarTexto(c.num, `¿Ya hiciste la transferencia de ${pesos(p.total)} al Nequi ${NEQUI}? 💜 Cuando puedas, mándame el pantallazo por aquí 📸`);
    }
    if (p && p.estado === "recibido" && !p.alertado && t - p.ts > T.alertaPedido) {
      p.alertado = true;
      await avisarEquipo(`⏰ El pedido #${p.codigo} lleva ${minutosDesde(p.ts)} min y no ha salido.\nCuando salga: /salio ${p.codigo}`, EQUIPO, botonesPedido(p));
    }
    // Limpieza de memoria
    const activo = p && ["recibido", "en_camino"].includes(p.estado);
    if (t - c.ultimaActividad > T.limpieza && !activo && !c.humano) {
      clientes.delete(c.num);
      for (const [cod, num] of porCodigo) if (num === c.num) porCodigo.delete(cod);
    }
  }
}
const reloj = setInterval(() => revisarPendientes().catch((e) => console.error("Error en revisión:", e.message)), 30 * 1000);
reloj.unref?.();

// ======================= RECEPCIÓN DE MENSAJES =======================
const vistos = new Set();
function yaVisto(id) {
  if (vistos.has(id)) return true;
  vistos.add(id);
  if (vistos.size > 3000) vistos.delete(vistos.values().next().value);
  return false;
}

const colas = new Map();
function encolar(clave, tarea) {
  const previa = colas.get(clave) || Promise.resolve();
  const siguiente = previa.then(tarea).catch((e) => console.error(`Error atendiendo ${clave}:`, e?.response?.data || e?.message || e));
  colas.set(clave, siguiente);
  siguiente.then(() => {
    if (colas.get(clave) === siguiente) colas.delete(clave);
  });
  return siguiente;
}

async function turnoSeguro(c, entrada) {
  try {
    await procesarTurno(c, entrada);
  } catch (e) {
    console.error(`Error procesando a ${c.num}:`, e?.response?.data || e?.message || e);
    c.fallos++;
    await responder(c, "Uy, tuve un problema por un momento 😅 ¿Me repites, por favor?").catch(() => {});
  }
}

const rafagas = new Map();
function acumular(c, texto) {
  let b = rafagas.get(c.num);
  if (!b) {
    b = { partes: [], timer: null };
    rafagas.set(c.num, b);
  }
  b.partes.push(texto);
  clearTimeout(b.timer);
  b.timer = setTimeout(() => {
    rafagas.delete(c.num);
    const unido = b.partes.filter(Boolean).join("\n");
    encolar(c.num, () => turnoSeguro(c, { texto: unido }));
  }, T.rafaga);
}

async function recibir(m, nombrePerfil, contacto = null) {
  if (!m?.id || yaVisto(m.id)) return;
  // Con número visible llega "from"; si la persona ocultó su número, llega solo "from_user_id" (ID tipo "CO.123…")
  const num = m.from || contacto?.wa_id || m.from_user_id || contacto?.user_id;
  if (!num) return console.warn("Mensaje sin remitente, ignorado");
  console.log(`Mensaje recibido de ${num} (${m.type})`);
  const esEquipo = EQUIPO.includes(num);
  if (esEquipo) encolar(`equipo:${num}`, () => reenviarPendientes(num));
  const textoPlano = m.type === "text" ? String(m.text?.body || "") : "";

  // Comandos del equipo: empiezan con / o #. Cualquier otro mensaje del equipo se atiende como cliente (sirve para probar).
  if (esEquipo && /^\s*[/#]/.test(textoPlano)) return encolar(`equipo:${num}`, () => comandoEquipo(num, textoPlano));
  if (esEquipo && m.type === "interactive") {
    const rid = String((m.interactive?.button_reply || m.interactive?.list_reply || {}).id || "");
    if (rid.startsWith("cmd:")) return encolar(`equipo:${num}`, () => comandoEquipo(num, comandoDeBoton(rid)));
  }

  const c = obtenerCliente(num, nombrePerfil);
  marcarLeido(m.id);

  switch (m.type) {
    case "text":
      return acumular(c, textoPlano);
    case "audio": {
      const transcrito = await transcribirAudio(m.audio?.id);
      console.log("Transcrito:", transcrito || "(vacío)");
      if (!transcrito) return encolar(num, () => responder(c, "Uy, no alcancé a escuchar bien tu nota de voz 😅 ¿Me la repites o me escribes?"));
      return acumular(c, transcrito);
    }
    case "interactive": {
      const resp = m.interactive?.button_reply || m.interactive?.list_reply || {};
      const id = String(resp.id || "");
      if (id.startsWith("prod:") && PRODUCTOS[id.slice(5)]) {
        return encolar(num, () => turnoSeguro(c, { producto: id.slice(5), texto: `Quiero ${PRODUCTOS[id.slice(5)].nombre}` }));
      }
      return encolar(num, () => turnoSeguro(c, { boton: id, texto: resp.title || "" }));
    }
    case "button":
      return acumular(c, m.button?.text || "");
    case "location": {
      const l = m.location || {};
      if (l.latitude == null || l.longitude == null) return;
      c.ubicacion = { lat: l.latitude, lng: l.longitude };
      const texto = `[Envié mi ubicación${l.address ? ` (${l.address})` : l.name ? ` (${l.name})` : ""}: ${mapa(c.ubicacion)}]`;
      // Si venía escribiendo, se junta con sus mensajes; si no, se atiende de una
      if (rafagas.has(num)) return acumular(c, texto);
      return encolar(num, () => turnoSeguro(c, { ubicacion: true, texto }));
    }
    case "order": {
      // Carrito enviado desde un catálogo de WhatsApp (si algún día conectas uno con los mismos id de menu.js)
      const items = (m.order?.product_items || []).map((i) => ({ id: i.product_retailer_id, cantidad: i.quantity, nota: "" }));
      return encolar(num, () => turnoSeguro(c, { carritoCatalogo: items, texto: "[Envió un carrito del catálogo]" }));
    }
    case "image":
    case "document":
    case "video":
      return encolar(num, () => manejarArchivo(c, m));
    case "reaction": {
      const emoji = norm(m.reaction?.emoji || "");
      if (c.estado === "esperando_confirmacion" && ["👍", "✅", "👌", "🙌", "❤", "🫶"].includes(emoji)) {
        return encolar(num, () => turnoSeguro(c, { boton: "confirmar", texto: m.reaction.emoji }));
      }
      return; // las demás reacciones se ignoran
    }
    case "sticker":
      return encolar(num, () => responderSticker(c));
    default:
      return encolar(num, () => responder(c, "Por ahora te entiendo mejor por texto o nota de voz 😊"));
  }
}

// Sticker sin pedido en curso: se responde con un meme y la lista para pedir. En medio de un pedido se ignora.
async function responderSticker(c) {
  reiniciarSiHaceFalta(c);
  if (c.humano || !abierto()) return;
  const enCurso = c.carrito.length || c.estado !== "armando" || (c.pedido && ["recibido", "en_camino"].includes(c.pedido.estado));
  if (enCurso) return;
  c.ultimaActividad = ahora();
  const yaLosVio = memesDe("sticker").every((f) => (c.memesVistos || []).includes(f));
  const conMeme = !yaLosVio && (await memeAntes(c, "sticker"));
  if (!c.menuEnviado || ahora() - c.menuEnviado > MENU_RECIENTE) return enviarMenu(c, conMeme ? "Mientras tanto, mira lo que tenemos 😋" : `¡Hola! 👋 Mira lo que tenemos hoy en ${MARCA} ${EMOJI}`);
  if (conMeme) {
    const texto = `¿Qué se te antoja? ${EMOJI} Elige aquí 👇`;
    recordar(c, "assistant", texto);
    return enviarLista(c, texto);
  }
}

async function manejarArchivo(c, m) {
  const tipo = m.type;
  const media = m[tipo] || {};
  const codigo = codigoDe(c);
  const p = c.pedido;
  const esComprobante = (p?.pago || c.pago) === "nequi";
  let caption = `📎 #${codigo} ${c.nombre || ""} (${enlaceCliente(c)}) envió ${tipo === "image" ? "una imagen" : "un archivo"}`;
  if (esComprobante) caption += " — posible comprobante de Nequi";
  if (media.caption) caption += `: “${media.caption}”`;
  if (p) caption += `\nPedido #${p.codigo}: total ${pesos(p.total)}`;
  if (esComprobante && p) {
    caption += `\n\n👉 Revisa en TU app de Nequi que llegaron ${pesos(p.total)} (valor exacto, hora y quién envía). El pantallazo solo no basta.\n✅ Llegó: /pagook ${p.codigo}\n❌ No llegó: /pagomal ${p.codigo}`;
  }
  caption += `\nResponde: #${codigo} tu mensaje`;

  if (c.humano) {
    await reenviarArchivo(media, tipo, caption, c.humano.escalado || !COCINA ? EQUIPO : [COCINA]);
    if (esComprobante && p && !p.pagoVerificado) {
      await avisarEquipo(`💜 ¿Llegaron ${pesos(p.total)} del #${p.codigo} a tu Nequi?`, c.humano.escalado || !COCINA ? EQUIPO : [COCINA], botonesPedido(p));
    }
    c.humano.ultimoMsgCliente = ahora();
    if (!c.humano.esperandoDesde) c.humano.esperandoDesde = ahora();
    return;
  }
  await reenviarArchivo(media, tipo, caption, EQUIPO);
  if (esComprobante && p && !p.pagoVerificado) await avisarEquipo(`💜 ¿Llegaron ${pesos(p.total)} del #${p.codigo} a tu Nequi?`, EQUIPO, botonesPedido(p));
  if (esComprobante) {
    if (p) {
      p.comprobante = true;
      if (p.pagoVerificado) return responder(c, "¡Recibido! 🙌 Tu pago ya está confirmado 💜");
      return responder(c, "¡Recibido! 🙌 Tu pedido ya está en cocina 👩‍🍳 y estamos verificando el pago. Te aviso apenas quede confirmado 💜");
    }
    c.comprobantePrevio = true;
    return responder(c, "¡Recibido! 🙌 Apenas confirmes el pedido lo verificamos 💜");
  }
  return pasarAHumano(c, `Envió ${tipo === "image" ? "una imagen" : "un archivo"}`, {
    tipo: "persona",
    mensaje: `¡Recibido! 🙌 Se lo paso ${A_QUIEN} para que lo revise. Te escribe en unos minutos.`,
  });
}

// ======================= SERVIDOR =======================
const app = express();
app.use(
  express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      req.rawBody = buf;
    },
  })
);

// Memes: el bot publica la carpeta "memes" para que WhatsApp pueda descargar las imágenes
app.use("/memes", express.static(CARPETA_MEMES, { maxAge: "7d" }));
// Si Railway no dio la dirección pública, se toma la que usa Meta (o tú) para llegar al bot
app.use((req, _res, next) => {
  const host = req.get("x-forwarded-host") || req.get("host") || "";
  if (!urlPublica && host && !/^(localhost|127\.|0\.0\.0\.0|\[::)/.test(host)) urlPublica = `https://${host}`;
  next();
});

app.get("/", (_req, res) => res.send(`${MARCA}: bot activo`));

app.get("/webhook", (req, res) => {
  if (req.query["hub.mode"] === "subscribe" && req.query["hub.verify_token"] === VERIFY_TOKEN) {
    console.log("Webhook verificado");
    return res.status(200).send(req.query["hub.challenge"]);
  }
  return res.sendStatus(403);
});

app.post("/webhook", (req, res) => {
  if (APP_SECRET) {
    const firma = req.get("x-hub-signature-256") || "";
    const esperada = "sha256=" + crypto.createHmac("sha256", APP_SECRET).update(req.rawBody || "").digest("hex");
    const ok = firma.length === esperada.length && crypto.timingSafeEqual(Buffer.from(firma), Buffer.from(esperada));
    if (!ok) {
      console.warn("Firma inválida, petición ignorada");
      return res.sendStatus(401);
    }
  }
  res.sendStatus(200); // responder ya para que Meta no reintente

  for (const entry of req.body?.entry || []) {
    for (const change of entry.changes || []) {
      const v = change.value || {};
      for (const st of v.statuses || []) manejarEstadoEntrega(st);
      for (const m of v.messages || []) {
        const contacto =
          (v.contacts || []).find((x) => (m.from && x.wa_id === m.from) || (m.from_user_id && x.user_id === m.from_user_id)) || v.contacts?.[0];
        recibir(m, contacto?.profile?.name, contacto).catch((e) => console.error("Error recibiendo:", e?.message || e));
      }
    }
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Bot de ${MARCA} corriendo en puerto ${PORT}`);
  console.log(
    `Equipo: ${EQUIPO.length} celular(es) | Modelo: ${GROQ_MODEL} | Barrios: ${BARRIOS.join(", ") || "todos"} | Horario: ${
      ABRE != null && CIERRA != null ? `${fmtHora(ABRE)} a ${fmtHora(CIERRA)}` : "siempre abierto"
    } | Nequi: ${NEQUI ? "sí" : "no"}`
  );
  console.log(
    `Memes: ${MEMES_ACTIVOS ? `${memesEnCarpeta.size} en la carpeta, salen ${Math.round(PROB_MEME * 100)}% de las veces` : MEMES.activo === false ? "apagados en menu.js" : "no hay carpeta memes (no se mandan)"}${
      MEMES_ACTIVOS ? ` | Dirección: ${urlPublica || "se toma con el primer mensaje"}` : ""
    }`
  );
  if (MEMES_ACTIVOS && memesFaltantes.length) console.warn(`⚠️ Memes nombrados en menu.js que NO están en la carpeta memes: ${memesFaltantes.join(", ")}`);
  if (!COCINA) console.warn("⚠️ Falta MI_NUMERO_COCINA: nadie recibirá pedidos ni avisos.");
  if (!GROQ_API_KEY) console.warn("⚠️ Falta GROQ_API_KEY: el bot no podrá entender mensajes.");
});
