// Landing page copy. Claims here describe what the product does today; avoid naming competitors.
export const landing = {
  nav: { features: "Qué resuelve", how: "Cómo funciona", distributors: "Distribuidores", compare: "Comparación", faq: "Preguntas", login: "Iniciar sesión", signup: "Crear cuenta" },

  hero: {
    eyebrow: "Para pequeños productores que venden por varios canales",
    title: "Sabes cuánto vendes. ¿Sabes cuánto ganas?",
    subtitle:
      "Conecta tus recetas, costos, producción, ventas y distribuidores. Descubre qué producto, canal o cliente te deja dinero de verdad, y qué hacer cuando sube un insumo.",
    primary: "Crear cuenta gratis",
    secondary: "Ver cómo funciona",
    note: "Sin instalación ni consultores. Tus datos, aislados y solo para tu equipo.",
  },

  problem: {
    title: "Tu negocio vive en cinco herramientas que no se hablan",
    items: [
      { tool: "La hoja de costos", pain: "se queda con el precio del insumo del día que la hiciste." },
      { tool: "El cuaderno o WhatsApp de pedidos", pain: "no te dice qué distribuidor te hace perder dinero." },
      { tool: "La producción", pain: "se hace a ojo: nadie sabe cuánta cera se fue en merma." },
      { tool: "La facturación", pain: "registra ventas, pero no su margen después de envíos y comisiones." },
      { tool: "El banco", pain: "te avisa del problema de caja cuando ya llegó." },
    ],
    conclusion: "El resultado: precios desactualizados, canales que pierden dinero sin que se note y sorpresas de caja.",
  },

  features: {
    title: "Lo que hace diferente a este sistema",
    subtitle: "No es otro sistema para registrar. Cada registro alimenta una decisión.",
    items: [
      {
        key: "rentabilidad",
        title: "Rentabilidad real por producto, canal y cliente",
        body: "Tu margen después del costo del producto y de lo que cuesta vender por cada canal: comisiones, cargos de tarjeta, envíos y empaque. Ves en rojo lo que pierde dinero.",
        example: "Ejemplo: «Sachet por distribuidores: −RD$180 este trimestre por el costo de entrega por pedido».",
      },
      {
        key: "costos",
        title: "Alerta cuando un insumo sube",
        body: "Cada compra actualiza el costo de tus recetas. Te decimos qué productos afecta, cuánto margen pierdes al mes, cuánto llevas perdido y qué precio lo corrige.",
        example: "Ejemplo: «La cera subió 20%: tu vela estrella perdió 5.5 puntos de margen. El precio que lo restaura es RD$453».",
      },
      {
        key: "produccion",
        title: "Costo real de producción vs. receta",
        body: "Cada lote descuenta lo que realmente consumiste. Ves la merma, el rendimiento y el sobrecosto por materia prima y por producto.",
        example: "Ejemplo: «La cera se usa 10% por encima de la receta en Vela lavanda: +RD$240 este mes».",
      },
      {
        key: "simulador",
        title: "Simulador antes de decidir",
        body: "¿Subo precios? ¿Contrato a alguien? ¿Acepto a un distribuidor con 30% de descuento? Ve el efecto en tu ganancia y tu punto de equilibrio antes de hacerlo.",
        example: "Ejemplo: «Contratar un ayudante sube tu punto de equilibrio a RD$182,000 en ventas al mes».",
      },
      {
        key: "plan",
        title: "Plan de producción y compras atado a tu caja",
        body: "Con tu demanda, inventario y pedidos pendientes te decimos qué producir, qué comprar y cuándo, y cómo queda tu caja semana a semana.",
        example: "Ejemplo: «Pide 6 kg de cera antes del jueves. Tu caja baja a RD$12,400 la semana del 20».",
      },
      {
        key: "informe",
        title: "Informe del mes que explica por qué",
        body: "Tu margen cambió: te decimos cuánto fue por volumen, por mezcla de productos y canales, por precio y por costo, y qué insumo lo causó. Calculado, no inventado.",
        example: "Ejemplo: «El margen bajó RD$8,200: 60% por el costo de la cera, 40% por vender más a distribuidores».",
      },
    ],
  },

  how: {
    title: "Cómo funciona",
    steps: [
      { title: "Carga tus insumos y recetas", body: "Materias primas con su costo y la receta de cada producto. El costo se calcula solo." },
      { title: "Opera como siempre", body: "Registra compras, producción y ventas. Tus distribuidores te piden por su propio portal." },
      { title: "Decide con información", body: "Alertas de margen, simulador, plan de compras y caja, e informe mensual." },
    ],
  },

  distributors: {
    title: "Un portal para tus distribuidores",
    body: "Invita a cada distribuidor con un enlace. Ven su lista de precios, el margen que pueden ganar, hacen pedidos y consultan su estado de cuenta. Tú apruebas y facturas en un clic.",
    points: [
      "Precios por distribuidor: su descuento se aplica solo.",
      "Pedidos con existencia y crédito a la vista antes de aprobar.",
      "Estado de cuenta siempre al día: menos llamadas para cobrar.",
      "Nunca ven tus costos ni tus márgenes.",
    ],
  },

  compare: {
    title: "Comparado con lo que usas hoy",
    columns: ["", "Hoja de cálculo", "Facturación o contabilidad general", "Este sistema"],
    rows: [
      { label: "Costo por receta que se actualiza con cada compra", values: ["Manual", "No", "Sí"] },
      { label: "Margen por canal y por cliente con costos de venta", values: ["Manual", "Pocas veces", "Sí"] },
      { label: "Impacto de un aumento de costo y precio sugerido", values: ["No", "No", "Sí"] },
      { label: "Costo real de producción vs. receta", values: ["No", "No", "Sí"] },
      { label: "Simulación de decisiones", values: ["Manual", "No", "Sí"] },
      { label: "Plan de compras atado a la caja", values: ["No", "Parcial", "Sí"] },
      { label: "Portal de pedidos para distribuidores", values: ["No", "Pocas veces", "Sí"] },
      { label: "Puesta en marcha", values: ["—", "Días o semanas", "Una tarde"] },
    ],
    footnote: "Las capacidades de otras herramientas varían; esta tabla compara categorías, no productos específicos.",
  },

  audience: {
    title: "Hecho para negocios que fabrican lo que venden",
    items: ["Velas, aromas y difusores", "Cosmética natural", "Alimentos y bebidas artesanales", "Panadería y repostería", "Textiles y confección", "Artesanía y decoración"],
    note: "Equipos de 2 a 30 personas que venden directo, en línea y a través de distribuidores.",
  },

  trust: {
    title: "Números en los que puedes confiar",
    items: [
      { title: "Cada empresa aislada", body: "Seguridad a nivel de base de datos: nadie fuera de tu equipo ve tu información." },
      { title: "Nada se borra en silencio", body: "Las facturas y compras se anulan con su motivo; el inventario es un registro de movimientos." },
      { title: "Roles para tu equipo", body: "Administrador, editor o solo lectura. Tus distribuidores tienen su propio acceso, sin ver costos." },
      { title: "Explicaciones, no cajas negras", body: "Cada número se calcula con tus datos y puedes ver de dónde sale." },
    ],
  },

  faq: {
    title: "Preguntas frecuentes",
    items: [
      { q: "¿Reemplaza mi facturación electrónica o a mi contador?", a: "No. Este sistema te ayuda a decidir y a operar; tu facturación fiscal y tu contabilidad siguen como están. La conexión con proveedores autorizados de facturación electrónica está en nuestra hoja de ruta." },
      { q: "¿Necesito ayuda para implementarlo?", a: "No. Si tienes tus costos en una hoja de cálculo, en una tarde cargas insumos, recetas y precios. El sistema te guía con una lista de pasos." },
      { q: "¿Qué pasa con mis distribuidores?", a: "Los invitas con un enlace. Solo ven sus precios, sus pedidos y su cuenta. Pueden trabajar con varios proveedores desde el mismo acceso." },
      { q: "¿Usa inteligencia artificial?", a: "Hoy todos los análisis son cálculos exactos sobre tus datos, para que puedas verificarlos. Agregaremos asistencia inteligente sobre esa misma base." },
      { q: "¿Funciona en el celular?", a: "Sí. Los dos portales funcionan en el navegador del teléfono, la tableta o la computadora." },
    ],
  },

  cta: {
    title: "Empieza por saber cuánto ganas de verdad",
    body: "Crea tu cuenta, carga tus recetas y en minutos verás el costo real de cada producto.",
    primary: "Crear cuenta gratis",
    secondary: "Ya tengo cuenta",
  },
};
