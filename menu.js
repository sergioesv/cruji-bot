/**
 * ============================================================
 *  MENÚ Y DATOS DEL NEGOCIO — CRUJI
 *  Este es el ÚNICO archivo que necesitas editar para cambiar
 *  productos, precios, bebidas, salsas, barrios u horario.
 * ============================================================
 *
 * ⚠️ Los precios de BEBIDAS, AJÍ EXTRA y COMBO FAMILIAR son DE EJEMPLO.
 *    Cámbialos por tus precios reales antes de vender.
 *
 * Cada producto tiene:
 *   nombre      como lo ve el cliente
 *   corto       nombre corto para la lista de WhatsApp (máximo 24 letras)
 *   precio      en pesos, sin puntos (5500, no 5.500)
 *   categoria   para agrupar el menú (las bebidas deben tener "Bebidas" en la categoría)
 *   alias       otras formas en que la gente lo pide (en minúscula y sin tildes)
 *   opciones    (opcional) sabores o variantes; si el cliente no dice cuál, el bot pregunta
 *   detalle     (opcional) aclaración que el bot puede usar al responder
 *   incluyeBebida (opcional) true si ya trae bebida (así el bot no ofrece bebida aparte)
 *   enLista     true si aparece en la lista para elegir con un toque (máximo 10 en total)
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
    detalle: "Es la empanada de pipián.",
    enLista: true,
  },

  // ---------- COMBOS ----------
  combo_norte: {
    nombre: "Combo Norte (2 pasteles + 4 clásicas)",
    corto: "Combo Norte",
    precio: 24000,
    categoria: "🎁 Combos",
    alias: ["combo norte", "combo"],
    enLista: true,
  },
  combo_familiar: {
    nombre: "Combo Familiar (6 pasteles + gaseosa 1.5 L)",
    corto: "Combo Familiar",
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

  // Barrios con domicilio. Si dejas la lista vacía [], el bot acepta cualquier barrio.
  barrios: ["Ciudad Jardín", "La Paz", "Santa Clara", "El Recuerdo"],

  costoDomicilio: 0, // en pesos. 0 = no se cobra ni se menciona
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
