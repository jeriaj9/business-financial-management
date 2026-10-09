// Maps database rows (snake_case, numeric strings) into the domain types used by the engines.
import { toNumber } from "@/lib/format";
import type { Channel, CostSettings, Expense, Material, MaterialCostChange, Product, ProductPriceChange, SaleLine } from "@/lib/domain/types";

/* eslint-disable @typescript-eslint/no-explicit-any */
export type Row = Record<string, any>;

export interface SettingsRecord extends CostSettings {
  id: string;
  currency: string;
  promotionalDiscount: number;
  allowNegativeStock: boolean;
  openingCashBalance: number;
  openingCashDate: string | null;
  defaultPaymentTermsDays: number;
  safetyStockWeeks: number;
  demandLookbackWeeks: number;
  defaultLeadTimeDays: number;
}

export function mapSettings(r: Row | null | undefined): SettingsRecord | null {
  if (!r) return null;
  return {
    id: r.id,
    currency: r.currency || "DOP",
    laborCostPerHour: toNumber(r.labor_cost_per_hour),
    indirectCostReserve: toNumber(r.indirect_cost_reserve),
    laborMode: r.labor_payment_mode === "hourly" || r.labor_payment_mode === "piece" ? r.labor_payment_mode : "salary",
    distributorMargin: toNumber(r.distributor_margin),
    promotionalDiscount: toNumber(r.promotional_discount),
    allowNegativeStock: Boolean(r.allow_negative_stock),
    openingCashBalance: toNumber(r.opening_cash_balance),
    openingCashDate: r.opening_cash_date ?? null,
    defaultPaymentTermsDays: toNumber(r.default_payment_terms_days),
    safetyStockWeeks: toNumber(r.safety_stock_weeks, 1),
    demandLookbackWeeks: toNumber(r.demand_lookback_weeks, 8),
    defaultLeadTimeDays: toNumber(r.default_lead_time_days, 7),
  };
}

export interface MaterialRecord extends Material {
  category: string;
  supplierName: string | null;
  notes: string | null;
  isActive: boolean;
}

export function mapMaterial(r: Row): MaterialRecord {
  return {
    id: r.id,
    name: r.name,
    unit: r.unit_of_measure,
    category: r.category ?? "",
    costPerUnit: toNumber(r.cost_per_unit),
    avgCost: toNumber(r.avg_cost, toNumber(r.cost_per_unit)),
    currentStock: toNumber(r.current_stock),
    reorderPoint: toNumber(r.reorder_point),
    leadTimeDays: r.lead_time_days === null || r.lead_time_days === undefined ? null : toNumber(r.lead_time_days),
    supplierId: r.supplier_id ?? null,
    supplierName: r.suppliers?.name ?? r.supplier ?? null,
    notes: r.notes ?? null,
    isActive: r.is_active !== false,
  };
}

export interface ProductRecord extends Product {
  description: string | null;
  materialUnitCost: number;
  laborUnitCost: number;
  overheadUnitCost: number;
}

export function mapProduct(r: Row): ProductRecord {
  return {
    id: r.id,
    name: r.name,
    sku: r.sku ?? null,
    category: r.category ?? null,
    description: r.description ?? null,
    batchSize: toNumber(r.batch_size, 1),
    productionTimeHours: toNumber(r.production_time_hours),
    laborCostPerPiece: toNumber(r.labor_cost_per_piece),
    retailPrice: toNumber(r.retail_price),
    distributorPrice: r.distributor_price === null || r.distributor_price === undefined ? null : toNumber(r.distributor_price),
    currentStock: toNumber(r.current_stock),
    avgUnitCost: r.avg_unit_cost === null || r.avg_unit_cost === undefined ? null : toNumber(r.avg_unit_cost),
    variableUnitCost: toNumber(r.variable_unit_cost),
    fullUnitCost: toNumber(r.total_cost),
    materialUnitCost: toNumber(r.calculated_material_cost),
    laborUnitCost: toNumber(r.calculated_labor_cost),
    overheadUnitCost: toNumber(r.calculated_indirect_cost),
    isActive: r.is_active !== false,
    recipe: (r.bom ?? []).map((b: Row) => ({ materialId: b.material_id, quantity: toNumber(b.quantity) })),
  };
}

export function mapChannel(r: Row): Channel {
  return {
    id: r.id,
    name: r.name,
    kind: r.kind,
    priceBasis: r.price_basis,
    commissionPct: toNumber(r.commission_pct),
    paymentFeePct: toNumber(r.payment_fee_pct),
    costPerOrder: toNumber(r.cost_per_order),
    costPerUnit: toNumber(r.cost_per_unit),
    paymentTermsDays: toNumber(r.payment_terms_days),
    isActive: r.is_active !== false,
  };
}

export interface DistributorRecord {
  id: string;
  name: string;
  contactName: string | null;
  email: string | null;
  phone: string | null;
  taxId: string | null;
  address: string | null;
  marginOverride: number | null;
  paymentTermsDays: number;
  creditLimit: number | null;
  territoryNotes: string | null;
  isActive: boolean;
}

export function mapDistributor(r: Row): DistributorRecord {
  return {
    id: r.id,
    name: r.name,
    contactName: r.contact_name ?? null,
    email: r.email ?? null,
    phone: r.phone ?? null,
    taxId: r.tax_id ?? null,
    address: r.address ?? null,
    marginOverride: r.margin_override === null || r.margin_override === undefined ? null : toNumber(r.margin_override),
    paymentTermsDays: toNumber(r.payment_terms_days, 30),
    creditLimit: r.credit_limit === null || r.credit_limit === undefined ? null : toNumber(r.credit_limit),
    territoryNotes: r.territory_notes ?? null,
    isActive: r.is_active !== false,
  };
}

/** One invoice line with its header (from invoice_lines?select=*,invoice:invoices!inner(...)). */
export function mapSaleLine(r: Row, productName: (id: string | null) => string): SaleLine {
  const inv = r.invoice;
  const counterpartyKey = inv.distributor_id
    ? `d:${inv.distributor_id}`
    : inv.customer_id
      ? `c:${inv.customer_id}`
      : inv.customer_name
        ? `n:${String(inv.customer_name).trim().toLowerCase()}`
        : "anon";
  const counterpartyLabel = inv.distributors?.name ?? inv.customers?.name ?? inv.customer_name ?? "Consumidor final";
  return {
    invoiceId: inv.id,
    invoiceNumber: inv.number,
    issueDate: inv.issue_date,
    channelId: inv.channel_id,
    counterpartyKey,
    counterpartyLabel,
    productId: r.product_id ?? null,
    productLabel: r.product_id ? productName(r.product_id) : r.description ?? "Artículo",
    quantity: toNumber(r.quantity),
    listPrice: toNumber(r.list_price),
    unitPrice: toNumber(r.unit_price),
    revenue: toNumber(r.line_total),
    cogs: toNumber(r.cogs),
  };
}

export function mapExpense(r: Row): Expense {
  return {
    id: r.id,
    date: r.expense_date,
    category: r.category ?? "Otros",
    amount: toNumber(r.amount),
    isRecurring: Boolean(r.is_recurring),
  };
}

export function mapCostChange(r: Row): MaterialCostChange {
  return {
    materialId: r.material_id,
    effectiveAt: r.effective_at,
    previousCost: r.previous_cost === null || r.previous_cost === undefined ? null : toNumber(r.previous_cost),
    newCost: toNumber(r.new_cost),
    source: r.source,
  };
}

export function mapPriceChange(r: Row): ProductPriceChange {
  return {
    productId: r.product_id,
    effectiveAt: r.effective_at,
    retailPrice: toNumber(r.retail_price),
    distributorPrice: r.distributor_price === null || r.distributor_price === undefined ? null : toNumber(r.distributor_price),
  };
}
