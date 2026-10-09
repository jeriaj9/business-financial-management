// Spanish texts shared across the product. Page-specific labels live next to their forms;
// everything reused (navigation, statuses, enums, generated explanations) lives here so a
// second language can be added by providing another dictionary with the same shape.
import type { Insight } from "@/lib/domain/insights";
import type { PaymentStatus } from "@/lib/domain/receivables";
import { formatMoney, formatPercent, formatPoints } from "@/lib/format";

export const es = {
  common: {
    save: "Guardar",
    saving: "Guardando…",
    cancel: "Cancelar",
    close: "Cerrar",
    edit: "Editar",
    delete: "Eliminar",
    create: "Crear",
    add: "Agregar",
    remove: "Quitar",
    confirm: "Confirmar",
    search: "Buscar…",
    loading: "Cargando…",
    noResults: "No hay resultados.",
    yes: "Sí",
    no: "No",
    optional: "opcional",
    total: "Total",
    actions: "Acciones",
    active: "Activo",
    inactive: "Inactivo",
    signOut: "Cerrar sesión",
    retry: "Reintentar",
    viewOnly: "Tu rol es de solo lectura.",
  },

  nav: {
    business: [
      {
        section: "Decidir",
        items: [
          { key: "resumen", label: "Resumen", href: "/app" },
          { key: "rentabilidad", label: "Rentabilidad", href: "/app/rentabilidad" },
          { key: "costos", label: "Impacto de costos", href: "/app/costos" },
          { key: "simulador", label: "Simulador", href: "/app/simulador" },
          { key: "planificacion", label: "Plan y caja", href: "/app/planificacion" },
          { key: "informe", label: "Informe del mes", href: "/app/informe" },
        ],
      },
      {
        section: "Operar",
        items: [
          { key: "ventas", label: "Ventas y cobros", href: "/app/ventas" },
          { key: "pedidos", label: "Pedidos de distribuidores", href: "/app/pedidos" },
          { key: "produccion", label: "Producción", href: "/app/produccion" },
          { key: "compras", label: "Compras", href: "/app/compras" },
          { key: "inventario", label: "Inventario", href: "/app/inventario" },
          { key: "gastos", label: "Gastos", href: "/app/gastos" },
        ],
      },
      {
        section: "Configurar",
        items: [
          { key: "productos", label: "Productos y recetas", href: "/app/productos" },
          { key: "materiales", label: "Materias primas", href: "/app/materiales" },
          { key: "distribuidores", label: "Distribuidores", href: "/app/distribuidores" },
          { key: "clientes", label: "Clientes", href: "/app/clientes" },
          { key: "proveedores", label: "Proveedores", href: "/app/proveedores" },
          { key: "configuracion", label: "Configuración", href: "/app/configuracion" },
        ],
      },
    ],
    portal: [
      { key: "inicio", label: "Inicio", href: "/distribuidor" },
      { key: "catalogo", label: "Catálogo y pedido", href: "/distribuidor/catalogo" },
      { key: "pedidos", label: "Mis pedidos", href: "/distribuidor/pedidos" },
      { key: "cuenta", label: "Estado de cuenta", href: "/distribuidor/estado-de-cuenta" },
    ],
  },

  roles: { admin: "Administrador", edit: "Editor", view: "Solo lectura" } as Record<string, string>,

  channelKinds: {
    direct: "Venta directa",
    distributor: "Distribuidores",
    online: "Online / redes",
    wholesale: "Mayoristas",
    other: "Otro",
  } as Record<string, string>,

  priceBasis: { retail: "Precio de lista", distributor: "Precio distribuidor" } as Record<string, string>,

  paymentStatus: {
    paid: "Pagada",
    partial: "Pago parcial",
    pending: "Pendiente",
    overdue: "Vencida",
    void: "Anulada",
  } as Record<PaymentStatus, string>,

  orderStatus: {
    submitted: "Enviado",
    invoiced: "Facturado",
    rejected: "Rechazado",
    cancelled: "Cancelado",
  } as Record<string, string>,

  productionStatus: { planned: "Planificada", completed: "Completada", cancelled: "Cancelada" } as Record<string, string>,

  transactionTypes: {
    OPENING: "Inventario inicial",
    PURCHASE: "Compra",
    PURCHASE_VOID: "Compra anulada",
    SALE: "Venta",
    SALE_VOID: "Venta anulada",
    PRODUCTION_USAGE: "Consumo en producción",
    PRODUCTION_OUTPUT: "Producción terminada",
    ADJUSTMENT_IN: "Ajuste (entrada)",
    ADJUSTMENT_OUT: "Ajuste (salida)",
    IN: "Entrada",
    OUT: "Salida",
    WASTE: "Merma",
  } as Record<string, string>,

  planStatus: { ok: "En plazo", soon: "Pronto", urgent: "Urgente" } as Record<string, string>,
  purchaseStatus: { ok: "En plazo", order_soon: "Pedir esta semana", late: "Atrasado" } as Record<string, string>,
};

/** Turns a structured insight into a sentence. */
export function insightText(insight: Insight, currency: string): string {
  const m = (v: number) => formatMoney(v, currency, { decimals: 0 });
  const signedMoney = (v: number) => (v >= 0 ? `+${m(v)}` : m(v));
  switch (insight.kind) {
    case "no_data":
      return "No hay ventas registradas en este período. Registra tus facturas para obtener el análisis.";
    case "headline": {
      const comparison =
        insight.deltaPct === null
          ? `${signedMoney(insight.delta)} frente al período anterior`
          : `${insight.delta >= 0 ? "más" : "menos"} que el período anterior (${signedMoney(insight.delta)}, ${formatPercent(insight.deltaPct, 1, { signed: true })})`;
      return `Tu margen de contribución fue ${m(insight.contribution)}, ${comparison}.`;
    }
    case "gross_margin":
      return `Tu margen bruto pasó de ${formatPercent(insight.marginPrev)} a ${formatPercent(insight.marginCurr)} (${formatPoints(insight.pts)}).`;
    case "volume":
      return insight.unitsPct === null
        ? `El cambio en unidades vendidas aportó ${signedMoney(insight.amount)}.`
        : `Vendiste ${formatPercent(Math.abs(insight.unitsPct), 0)} ${insight.unitsPct >= 0 ? "más" : "menos"} unidades; eso ${insight.amount >= 0 ? "sumó" : "restó"} ${m(Math.abs(insight.amount))}.`;
    case "mix":
      return insight.channelLabel
        ? `La mezcla de productos y canales ${insight.amount >= 0 ? "sumó" : "restó"} ${m(Math.abs(insight.amount))}: ${insight.channelLabel} ganó ${formatPoints(insight.channelSharePts)} de participación en unidades.`
        : `La mezcla de productos y canales ${insight.amount >= 0 ? "sumó" : "restó"} ${m(Math.abs(insight.amount))}.`;
    case "price":
      return `Los precios netos ${insight.amount >= 0 ? "subieron y sumaron" : "bajaron (descuentos o precios distintos) y restaron"} ${m(Math.abs(insight.amount))}${insight.productLabel ? `; el mayor cambio fue en ${insight.productLabel}` : ""}.`;
    case "cost":
      return `El costo de lo vendido ${insight.amount <= 0 ? "subió y restó" : "bajó y sumó"} ${m(Math.abs(insight.amount))}${
        insight.materialName
          ? `; la causa principal fue ${insight.materialName} (${formatPercent(insight.materialChangePct, 1, { signed: true })} en su costo)`
          : ""
      }.`;
    case "expenses":
      return `Tus gastos fueron ${m(insight.amount)}${insight.deltaPct !== null ? ` (${formatPercent(insight.deltaPct, 0, { signed: true })} vs. el período anterior)` : ""}${
        insight.categoryLabel ? `; el mayor aumento fue en ${insight.categoryLabel} (+${m(insight.categoryDelta)})` : ""
      }.`;
    case "operating":
      return insight.amount >= 0
        ? `Después de gastos, el negocio generó un resultado operativo de ${m(insight.amount)}.`
        : `Después de gastos, el resultado operativo fue negativo: ${m(insight.amount)}. Las ventas no cubrieron los gastos fijos del período.`;
    case "top_product":
      return `${insight.productLabel} fue tu producto más rentable: aportó ${m(insight.contribution)} (${formatPercent(insight.share, 0)} de la contribución).`;
    case "loss_maker":
      return `${insight.productLabel} vendido por ${insight.channelLabel} perdió dinero: ${m(insight.contribution)} después de costos del canal.`;
    case "receivables":
      return insight.overdue > 0
        ? `Tienes ${m(insight.amount)} por cobrar, de los cuales ${m(insight.overdue)} están vencidos.`
        : `Tienes ${m(insight.amount)} por cobrar, todo dentro de plazo.`;
  }
}
