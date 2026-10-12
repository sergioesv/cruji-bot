/**
 * ============================================================
 *  MENÚ Y DATOS DEL NEGOCIO — SALCHIPAPAS
 *  Este es el ÚNICO archivo que necesitas editar para cambiar
 *  productos, precios, salsas, bebidas, barrios u horario.
 * ============================================================
 *
 * Cada producto tiene:
 *   nombre      como lo ve el cliente
 *   corto       nombre corto para la lista de WhatsApp (máximo 24 letras)
 *   precio      en pesos, sin puntos (8000, no 8.000)
 *   categoria   para agrupar el menú (las bebidas deben tener "Bebidas" en la categoría)
 *   alias       otras formas en que la gente lo pide (en minúscula y sin tildes)
 *   descripcion (opcional) lo que trae, en pocas palabras; sale en el menú y en la lista
 *   opciones    (opcional) sabores o variantes; si el cliente no dice cuál, el bot pregunta
 *   enLista     true si aparece en la lista para elegir con un toque (máximo 10 en total)
 *
 * Para agregar un producto, copia un bloque completo, cambia el id (lo que va antes de los
 * dos puntos, sin espacios ni tildes) y sus datos. El id no se debe repetir.
 * Para agotar algo solo por hoy, NO lo borres: usa /agotado desde el celular de cocina.
 */

export const PRODUCTOS = {
  // ---------- SALCHIPAPAS ----------
  salchipapa_sencilla: {
    nombre: "Salchipapa sencilla",
    corto: "Salchipapa sencilla",
    precio: 8000,
    categoria: "🍟 Salchipapas",
    descripcion: "", // ej: "Papa a la francesa + salchicha + salsas"
    alias: ["sencilla", "sencillas", "normal", "salchipapa sencilla", "salchipapa normal"],
    enLista: true,
  },
  salchipapa_lomo: {
    nombre: "Salchipapa de lomo",
    corto: "Salchipapa de lomo",
    precio: 12000,
    categoria: "🍟 Salchipapas",
    descripcion: "", // ej: "Papa + salchicha + lomo en trocitos"
    alias: ["lomo", "de lomo", "con lomo", "salchipapa de lomo", "salchipapa con lomo"],
    enLista: true,
  },
  salchipapa_chorizo: {
    nombre: "Salchipapa de chorizo",
    corto: "Salchipapa de chorizo",
    precio: 12000,
    categoria: "🍟 Salchipapas",
    descripcion: "", // ej: "Papa + salchicha + chorizo"
    alias: ["chorizo", "de chorizo", "con chorizo", "salchipapa de chorizo", "salchipapa con chorizo"],
    enLista: true,
  },

  // ---------- BEBIDAS (⚠️ precios de ejemplo) ----------
  gaseosa_personal: {
    nombre: "Gaseosa personal 400 ml",
    corto: "Gaseosa personal",
    precio: 3500,
    categoria: "🥤 Bebidas",
    alias: ["gaseosa", "gaseosas", "coca cola", "cocacola", "coca", "postobon", "colombiana", "manzana", "uva"],
    opciones: ["Coca-Cola", "Coca-Cola sin azúcar", "Postobón manzana", "Postobón uva", "Colombiana"],
    enLista: true,
  },
  gaseosa_grande: {
    nombre: "Gaseosa 1.5 L",
    corto: "Gaseosa 1.5 L",
    precio: 7000,
    categoria: "🥤 Bebidas",
    alias: ["gaseosa grande", "litro y medio", "1.5", "1,5", "gaseosa familiar"],
    opciones: ["Coca-Cola", "Postobón manzana", "Colombiana"],
    enLista: true,
  },
  agua: {
    nombre: "Agua 600 ml",
    corto: "Agua",
    precio: 2500,
    categoria: "🥤 Bebidas",
    alias: ["agua", "botella de agua", "agua con gas"],
    opciones: ["Sin gas", "Con gas"],
    enLista: true,
  },
  jugo: {
    nombre: "Jugo Hit 500 ml",
    corto: "Jugo Hit",
    precio: 3500,
    categoria: "🥤 Bebidas",
    alias: ["jugo", "jugos", "hit"],
    opciones: ["Mango", "Mora", "Lulo", "Naranja-piña"],
    enLista: true,
  },
  te_frio: {
    nombre: "Té frío 400 ml",
    corto: "Té frío",
    precio: 3500,
    categoria: "🥤 Bebidas",
    alias: ["te", "te frio", "mr tea"],
    opciones: ["Durazno", "Limón"],
    enLista: true,
  },
};

// Salsas que van GRATIS. ⚠️ Ajusta a las que de verdad das.
// Si dejas porDefecto vacío "", el resumen no menciona salsas a menos que el cliente las pida.
export const SALSAS = {
  incluidas: ["Salsa rosada", "Salsa de piña", "Mayonesa", "Salsa de tomate"],
  porDefecto: "Todas las salsas de la casa",
};

export const NEGOCIO = {
  // ---------- IDENTIDAD (cómo se presenta el bot) ----------
  marca: "Pedidito", // nombre del negocio que dice el bot. Cámbialo por la marca de las salchipapas si tienen una.
  emoji: "🍟",
  lema: "Salchipapas recién hechas, a domicilio.",
  descripcion: "salchipapas a domicilio", // cómo se describe el negocio ante la IA
  ejemploPedido: "2 salchipapas de lomo y 1 sencilla", // ejemplo que sale en el menú
  reglasProductos: `- Si dice "salchipapa" o "salchipapas" sin decir cuál, no adivines: pregunta si la quiere sencilla, de lomo o de chorizo, y pon falta_aclarar = true.
- "salchi" o "salchipapita" = salchipapa.`,

  // Quién atiende cuando el bot pasa la conversación a una persona (aparece en los mensajes al cliente)
  encargado: "Sergio",

  // ---------- DOMICILIOS ----------
  // ⚠️ Pon los barrios a los que llegan y lo que cuesta el domicilio a cada uno (en pesos, sin puntos). Ejemplo:
  //   barrios: { "La Paz": 2000, "Ciudad Jardín": 3000 },
  // Si dejas {} vacío, el bot acepta cualquier barrio y no cobra domicilio.
  barrios: {},

  // OPCIONAL: cobrar por distancia cuando el cliente manda su ubicación 📍.
  // Pon la ubicación de la cocina así: ubicacionLocal: { lat: 2.4448, lng: -76.6147 },
  ubicacionLocal: null,
  tarifasPorDistancia: [
    { hastaKm: 1, valor: 1500 }, // ⚠️ valores de ejemplo
    { hastaKm: 2.5, valor: 2500 },
    { hastaKm: 4, valor: 3500 },
    { hastaKm: 6, valor: 5000 },
  ],
  costoDomicilio: 0, // tarifa general si el barrio no tiene una propia. 0 = no se cobra ni se menciona

  pedidoMinimo: 0, // mínimo para domicilio en pesos. 0 = sin mínimo
  tiempoEntrega: "30 a 40 minutos", // lo que se le promete al cliente (se cambia en vivo con /demora)

  // Horario en hora de Colombia (formato 24 h: "17", "17:30", "23"). Vacíos "" = siempre abierto.
  horaAbre: "",
  horaCierra: "",

  nequi: "", // número de Nequi; vacío = solo efectivo
  telefono: "", // número para llamar si hay una urgencia
  direccionLocal: "", // si se puede recoger en el local, pon la dirección; vacío = solo domicilio

  imagenMenu: "", // enlace público a una foto del menú (opcional)
  catalogoWhatsApp: "", // ID del catálogo de Meta (opcional)

  // Respuestas a preguntas frecuentes. El bot SOLO responde lo que esté aquí;
  // lo que no sepa se lo pasa a una persona. Escribe frases cortas.
  informacion: ``,

  // Tiempos (en minutos)
  minutosParaCambios: 10,
  minutosEsperaPersona: 5,
  minutosAlertaPedido: 45,
};
