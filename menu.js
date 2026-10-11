/**
 * ============================================================
 *  MENÚ Y DATOS DEL NEGOCIO — CRUJI
 *  Este es el ÚNICO archivo que necesitas editar para cambiar
 *  productos, precios, bebidas, salsas, barrios u horario.
 * ============================================================
 *
 * ⚠️ Los precios de BEBIDAS, AJÍ EXTRA, COMBO FAMILIAR y DOMICILIOS son DE EJEMPLO.
 *    Cámbialos por tus precios reales antes de vender.
 *
 * Cada producto tiene:
 *   nombre      como lo ve el cliente
 *   corto       nombre corto para la lista de WhatsApp (máximo 24 letras)
 *   precio      en pesos, sin puntos (5500, no 5.500)
 *   categoria   para agrupar el menú (las bebidas deben tener "Bebidas" en la categoría)
 *   alias       otras formas en que la gente lo pide (en minúscula y sin tildes)
 *   opciones    (opcional) sabores o variantes; si el cliente no dice cuál, el bot pregunta
 *   descripcion (opcional) lo que trae, en pocas palabras; sale en el menú y en la lista (ej: "2 pasteles + 4 clásicas")
 *   detalle     (opcional) aclaración que el bot puede usar al responder
 *   incluyeBebida (opcional) true si ya trae bebida (así el bot no ofrece bebida aparte)
 *   enLista     true si aparece en la lista para elegir con un toque (máximo 10 en total)
 *
 * Cómo se ve el menú: las categorías principales (pasteles, combos) salen con detalle y en el orden de
 * este archivo. Las categorías que dicen "Bebidas" o "Salsas" se resumen en una línea al final.
 *
 * Para quitar un producto, borra su bloque completo.
 * Para agotar algo solo por hoy, NO lo borres: usa /agotado desde el celular de cocina.
 * El "id" (lo que va antes de los dos puntos, ej: pastel_pollo) no se debe repetir.
 */

export const PRODUCTOS = {
  // ---------- PASTELES Y EMPANADAS ----------
  pastel_pollo: {
    nombre: "Pastel de pollo",
    corto: "Pastel de pollo",
    precio: 5500,
    categoria: "🥟 Pasteles y empanadas",
    alias: ["pastel", "pasteles", "pastelito", "pastelitos"],
    enLista: true,
  },
  empanada_clasica: {
    nombre: "Empanada clásica",
    corto: "Empanada clásica",
    precio: 3000,
    categoria: "🥟 Pasteles y empanadas",
    alias: ["clasica", "clasicas", "empanada clasica", "empanadas clasicas"],
    enLista: true,
  },
  sabor_tradicional: {
    nombre: "Empanada sabor tradicional",
    corto: "Empanada tradicional",
    precio: 2800,
    categoria: "🥟 Pasteles y empanadas",
    alias: ["tradicional", "tradicionales", "pipian", "de pipian"],
    descripcion: "De pipián",
    detalle: "Es la empanada de pipián.",
    enLista: true,
  },

  // ---------- COMBOS ----------
  combo_norte: {
    nombre: "Combo Norte (2 pasteles + 4 clásicas)",
    corto: "Combo Norte",
    descripcion: "2 pasteles + 4 empanadas clásicas",
    precio: 24000,
    categoria: "🎁 Combos",
    alias: ["combo norte", "combo"],
    enLista: true,
  },
  combo_familiar: {
    nombre: "Combo Familiar (6 pasteles + gaseosa 1.5 L)",
    corto: "Combo Familiar",
    descripcion: "6 pasteles + gaseosa 1.5 L",
    precio: 38000, // ⚠️ precio de ejemplo
    categoria: "🎁 Combos",
    alias: ["combo familiar", "familiar"],
    opciones: ["Coca-Cola", "Postobón manzana", "Colombiana"],
    incluyeBebida: true,
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

  // ---------- SALSAS EXTRA (⚠️ precio de ejemplo) ----------
  aji_extra: {
    nombre: "Porción extra de ají",
    corto: "Ají extra",
    precio: 1000,
    categoria: "🌶️ Salsas extra",
    alias: ["aji extra", "mas aji", "porcion de aji", "porcion extra"],
    opciones: ["Ají de maní", "Ají picante"],
    enLista: false,
  },
};

// Salsas que van GRATIS con el pedido. El cliente puede elegir; si no dice nada, va "porDefecto".
export const SALSAS = {
  incluidas: ["Ají de maní", "Ají picante"],
  porDefecto: "Ají de maní",
};

export const NEGOCIO = {
  // Quién atiende cuando el bot pasa la conversación a una persona (aparece en los mensajes al cliente)
  encargado: "Sergio",

  // ---------- DOMICILIOS ----------
  // Barrios a los que llegan y lo que cuesta el domicilio a cada uno (en pesos, sin puntos). ⚠️ valores de ejemplo
  // Pon 0 si a ese barrio es gratis. Si un cliente pide para un barrio que no está aquí,
  // el bot no lo rechaza: te consulta, y tú respondes por ejemplo /aceptar 7 4000
  barrios: {
    "Ciudad Jardín": 2000,
    "La Paz": 2000,
    "Santa Clara": 3000,
    "El Recuerdo": 3000,
  },

  // OPCIONAL: cobrar por distancia cuando el cliente manda su ubicación 📍 (es más justo que por barrio).
  // 1. Abre Google Maps, mantén presionado tu local y copia los dos números que aparecen (ej: 2.4448, -76.6147)
  // 2. Ponlos aquí así: ubicacionLocal: { lat: 2.4448, lng: -76.6147 },
  // Si el cliente no manda ubicación, se usa la tarifa de su barrio. Más lejos que la tabla = te consulta.
  ubicacionLocal: null,
  tarifasPorDistancia: [
    { hastaKm: 1, valor: 1500 }, // ⚠️ valores de ejemplo
    { hastaKm: 2.5, valor: 2500 },
    { hastaKm: 4, valor: 3500 },
    { hastaKm: 6, valor: 5000 },
  ],

  pedidoMinimo: 0, // mínimo para domicilio en pesos. 0 = sin mínimo
  tiempoEntrega: "30 a 40 minutos", // lo que se le promete al cliente (se cambia en vivo con /demora)

  // Horario en hora de Colombia (formato 24 h: "11", "11:30", "21"). Vacíos "" = siempre abierto.
  horaAbre: "",
  horaCierra: "",

  nequi: "", // número de Nequi; vacío = solo efectivo
  telefono: "", // número para llamar si hay una urgencia (se da al cliente si nadie responde)
  direccionLocal: "", // si el cliente puede recoger en el local, pon la dirección; vacío = solo domicilio

  // Foto del menú (opcional): un enlace público a una imagen JPG o PNG.
  // Puedes subirla a Supabase Storage (bucket público) y pegar aquí el enlace.
  imagenMenu: "",

  // Catálogo de WhatsApp (opcional, lo más bonito): el cliente ve fotos, agrega varias cosas a un carrito y lo envía.
  // 1. Crea el catálogo en Commerce Manager (business.facebook.com/commerce) y agrega cada producto con foto y precio.
  // 2. En cada producto, el "ID de contenido" (o SKU) debe ser EXACTAMENTE el id de arriba (ej: pastel_pollo).
  // 3. Conecta el catálogo a tu cuenta de WhatsApp (WhatsApp Manager → Catálogo).
  // 4. Pega aquí el número del catálogo. Si lo dejas vacío, el bot usa la lista normal.
  catalogoWhatsApp: "",

  // Respuestas a preguntas frecuentes. El bot SOLO responde lo que esté aquí;
  // lo que no sepa se lo pasa a una persona. Escribe frases cortas.
  informacion: `
Los pasteles y empanadas son fritos y se entregan calientes.
`.trim(),

  // Tiempos (en minutos)
  minutosParaCambios: 10, // tiempo en que el cliente puede cambiar o cancelar solo, sin pasar por una persona
  minutosEsperaPersona: 5, // cada cuánto se insiste si la persona no ha respondido
  minutosAlertaPedido: 45, // si un pedido no ha salido en este tiempo, se avisa a cocina
};
