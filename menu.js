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
    enLista: false,
  },
  gaseosa_grande: {
    nombre: "Gaseosa 1.5 L",
    corto: "Gaseosa 1.5 L",
    precio: 7000,
    categoria: "🥤 Bebidas",
    alias: ["gaseosa grande", "litro y medio", "1.5", "1,5", "gaseosa familiar"],
    opciones: ["Coca-Cola", "Postobón manzana", "Colombiana"],
    enLista: false,
  },
  agua: {
    nombre: "Agua 600 ml",
    corto: "Agua",
    precio: 2500,
    categoria: "🥤 Bebidas",
    alias: ["agua", "botella de agua", "agua con gas"],
    opciones: ["Sin gas", "Con gas"],
    enLista: false,
  },
  jugo: {
    nombre: "Jugo Hit 500 ml",
    corto: "Jugo Hit",
    precio: 3500,
    categoria: "🥤 Bebidas",
    alias: ["jugo", "jugos", "hit"],
    opciones: ["Mango", "Mora", "Lulo", "Naranja-piña"],
    enLista: false,
  },
  te_frio: {
    nombre: "Té frío 400 ml",
    corto: "Té frío",
    precio: 3500,
    categoria: "🥤 Bebidas",
    alias: ["te", "te frio", "mr tea"],
    opciones: ["Durazno", "Limón"],
    enLista: false,
  },
};

// Salsas que van GRATIS. ⚠️ Ajusta a las que de verdad das.
// Si dejas porDefecto vacío "", el resumen no menciona salsas a menos que el cliente las pida.
export const SALSAS = {
  incluidas: ["Salsa rosada", "Salsa de piña", "Mayonesa", "Salsa de tomate"],
  porDefecto: "Todas las salsas de la casa",
  mostrarEnMenu: false, // false = el menú no habla de salsas (van incluidas igual)
  mostrarEnResumen: false, // false = el resumen solo las menciona si el cliente pidió algo especial ("sin piña")
};

export const NEGOCIO = {
  // ---------- IDENTIDAD (cómo se presenta el bot) ----------
  mensajesCortos: true, // true = saludo, menú y respuestas cortos (la gente lee la notificación sin abrir el chat)
  marca: "Pedidito", // nombre del negocio que dice el bot. Cámbialo por la marca de las salchipapas si tienen una.
  emoji: "🍟",
  lema: "Salchipapas recién hechas, a domicilio.",
  descripcion: "salchipapas a domicilio", // cómo se describe el negocio ante la IA
  ejemploPedido: "2 salchipapas de lomo y 1 sencilla", // ejemplo que sale en el menú
  reglasProductos: `- Si dice "salchipapa" o "salchipapas" sin decir cuál, no adivines: pregunta si la quiere sencilla, de lomo o de chorizo, y pon falta_aclarar = true.
- "salchi" o "salchipapita" = salchipapa.`,

  // Al elegir de la lista: true = pregunta "¿cuántas?" con botones 1 · 2 · 3 · false = anota 1 y sigue
  preguntarCuantosEnLista: true,

  // Cuando el cliente pide "una salchipapa" sin decir cuál, el bot pregunta con botones (máximo 3 productos).
  // palabras: cómo la gente nombra el producto sin decir el tipo (en minúscula y sin tildes)
  preguntarTipo: {
    palabras: ["salchipapa", "salchipapas", "salchi", "salchis", "salchipapita", "salchipapitas"],
    productos: ["salchipapa_sencilla", "salchipapa_lomo", "salchipapa_chorizo"],
    pregunta: "¿Cuál salchipapa quieres? 👇",
  },

  // Quién atiende cuando el bot pasa la conversación a una persona (aparece en los mensajes al cliente)
  encargado: "Sergio",

  // ---------- DOMICILIOS ----------
  // ⚠️ Pon los barrios a los que llegan y lo que cuesta el domicilio a cada uno (en pesos, sin puntos). Ejemplo:
  //   barrios: { "La Paz": 2000, "Ciudad Jardín": 3000 },
  // Si dejas {} vacío, el bot acepta cualquier barrio y no cobra domicilio.
  barrios: {},

  // OPCIONAL: cobrar por distancia cuando el cliente manda su ubicación 📍.
  // Ubicación de la cocina (sacada del enlace de Google Maps que mandaste).
  ubicacionLocal: { lat: 2.4419948, lng: -76.6028088 },
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

  nequi: "3026801968", // ⚠️ número de Nequi del negocio, ej: "3001234567". Vacío = solo efectivo. Con número, el bot ofrece botones Nequi / Efectivo
  nequiTitular: "sergio", // a nombre de quién está el Nequi, ej: "Sergio E." (el cliente lo ve al transferir y confía más)
  telefono: "3026801968", // número para llamar si hay una urgencia
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

/**
 * ============================================================
 *  MEMES 🐱
 *  Las imágenes van en la carpeta "memes" del repositorio (al lado de este archivo).
 *  Aquí dices cuál va en cada momento. Si un momento tiene varias, se turnan.
 *  Para cambiar uno: sube la imagen nueva a la carpeta y cambia el nombre aquí.
 *  Para quitar un momento: deja su lista vacía [].
 *  El bot NUNCA manda memes en quejas, demoras, cuando el cliente está molesto
 *  o cuando lo está atendiendo una persona.
 * ============================================================
 */
export const MEMES = {
  activo: true, // false = el bot no manda ningún meme
  probabilidad: 0.5, // 0.5 = la mitad de las veces · 1 = siempre · 0.3 = de vez en cuando
  maximoPorPedido: 3, // máximo de memes en una misma conversación (para que no canse)
  pausaSaludoSegundos: 5, // después del meme del saludo, espera esto antes de mandar el menú (solo si salió meme)
  pausaSegundos: 2.5, // la misma pausa en los demás momentos (corta, para no demorar el pedido)
  siempre: ["sticker", "confirmado"], // momentos en los que el meme sale siempre (no cuentan en el máximo)
  horaNoche: "21", // desde esta hora (formato 24 h) se usa "entregado_noche" en vez de "entregado"

  momentos: {
    saludo: ["saludo.jpg", "mesada.jpg"], // cliente nuevo saluda (va con el menú)
    cliente_que_vuelve: ["cliente_que_vuelve.jpg"], // saluda alguien que ya había pedido
    aclarar: ["aclarar.jpg"], // pidió "una salchi" sin decir cuál
    compartir: ["compartir.jpg"], // pidió una sola salchipapa (en el "¿Algo más?")
    bebida: ["bebida.jpg"], // se le ofrece bebida
    cambio: ["cambio.jpg"], // paga con billete de $100.000 o más
    confirmado: ["confirmado.jpg", "confirmado_2.jpg"], // confirmó el pedido
    sin_confirmar: ["sin_confirmar.jpg"], // no confirmó el resumen en 10 minutos
    nequi: ["nequi.jpg"], // cocina verificó el pago de Nequi (/pagook)
    salio: ["salio.jpg", "salio_2.jpg"], // /salio desde cocina
    entregado: ["entregado.jpg"], // /entregado de día
    entregado_noche: ["entregado_noche.jpg"], // /entregado de noche
    gracias: ["gracias.jpg", "gracias_2.jpg", "gracias_3.jpg"], // el cliente da las gracias
    agotado: ["agotado.jpg"], // pidió algo que se acabó hoy
    cancelado: ["cancelado.jpg"], // el CLIENTE canceló (si cancela cocina, no va meme)
    cerrado: ["cerrado.jpg"], // escribe cuando está cerrado
    sticker: ["sticker_cliente.jpg"], // el cliente manda un sticker (sin pedido en curso)
  },
};
