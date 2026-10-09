// Domain shapes used by the pure engines. Pages map database rows into these.
import type { ISODate } from "./dates";

export type ChannelKind = "direct" | "distributor" | "online" | "wholesale" | "other";
export type PriceBasis = "retail" | "distributor";

export interface CostSettings {
  laborCostPerHour: number;
  indirectCostReserve: number; // fraction, e.g. 0.10
  laborIsVariable: boolean;
  distributorMargin: number; // default distributor discount off retail, fraction
}

export interface Material {
  id: string;
  name: string;
  unit: string;
  costPerUnit: number; // replacement (last purchase / standard) cost
  avgCost: number; // moving average actual cost
  currentStock: number;
  reorderPoint: number;
  leadTimeDays: number | null;
  supplierId: string | null;
}

export interface RecipeLine {
  materialId: string;
  quantity: number; // per batch
}

export interface Product {
  id: string;
  name: string;
  sku: string | null;
  category: string | null;
  batchSize: number;
  productionTimeHours: number; // per batch
  retailPrice: number;
  distributorPrice: number | null; // null = automatic
  currentStock: number;
  avgUnitCost: number | null;
  variableUnitCost: number;
  fullUnitCost: number;
  isActive: boolean;
  recipe: RecipeLine[];
}

export interface Channel {
  id: string;
  name: string;
  kind: ChannelKind;
  priceBasis: PriceBasis;
  commissionPct: number;
  paymentFeePct: number;
  costPerOrder: number;
  costPerUnit: number;
  paymentTermsDays: number;
  isActive: boolean;
}

/** One invoice line enriched with its header, as used by the analytics engines. */
export interface SaleLine {
  invoiceId: string;
  invoiceNumber: string;
  issueDate: ISODate;
  channelId: string;
  counterpartyKey: string; // "d:<distributorId>" | "c:<customerId>" | "n:<name>" | "anon"
  counterpartyLabel: string;
  productId: string | null;
  productLabel: string;
  quantity: number;
  listPrice: number;
  unitPrice: number;
  revenue: number; // net line total
  cogs: number;
}

export interface MaterialCostChange {
  materialId: string;
  effectiveAt: string; // timestamp
  previousCost: number | null;
  newCost: number;
  source: "initial" | "manual" | "purchase";
}

export interface ProductPriceChange {
  productId: string;
  effectiveAt: string;
  retailPrice: number;
  distributorPrice: number | null;
}

export interface Expense {
  id: string;
  date: ISODate;
  category: string;
  amount: number;
  isRecurring: boolean;
}

export interface OpenDocument {
  id: string;
  number: string;
  dueDate: ISODate;
  balance: number;
  counterpartyLabel: string;
}
