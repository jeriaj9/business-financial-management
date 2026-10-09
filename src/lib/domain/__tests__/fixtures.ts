import type { Channel, CostSettings, Material, Product, SaleLine } from "../types";

export const settings: CostSettings = {
  laborCostPerHour: 100,
  indirectCostReserve: 0.1,
  laborIsVariable: false,
  distributorMargin: 0.2,
};

export const wax: Material = {
  id: "wax",
  name: "Cera de soya",
  unit: "g",
  costPerUnit: 0.5,
  avgCost: 0.5,
  currentStock: 10000,
  reorderPoint: 2000,
  leadTimeDays: null,
  supplierId: "sup1",
};

export const fragrance: Material = {
  id: "frag",
  name: "Fragancia lavanda",
  unit: "ml",
  costPerUnit: 3,
  avgCost: 3,
  currentStock: 500,
  reorderPoint: 100,
  leadTimeDays: 14,
  supplierId: null,
};

// material 130, labor 20, overhead 15 -> full 165, variable 130
export const candle: Product = {
  id: "candle",
  name: "Vela lavanda",
  sku: "VEL-001",
  category: "Velas",
  batchSize: 10,
  productionTimeHours: 2,
  retailPrice: 400,
  distributorPrice: null,
  currentStock: 20,
  avgUnitCost: null,
  variableUnitCost: 130,
  fullUnitCost: 165,
  isActive: true,
  recipe: [
    { materialId: "wax", quantity: 2000 },
    { materialId: "frag", quantity: 100 },
  ],
};

// material 9, labor 5, overhead 1.4 -> full 15.4, variable 9
export const sachet: Product = {
  id: "sachet",
  name: "Sachet",
  sku: null,
  category: "Sachets",
  batchSize: 20,
  productionTimeHours: 1,
  retailPrice: 40,
  distributorPrice: 30,
  currentStock: 100,
  avgUnitCost: null,
  variableUnitCost: 9,
  fullUnitCost: 15.4,
  isActive: true,
  recipe: [{ materialId: "frag", quantity: 60 }],
};

export const direct: Channel = {
  id: "direct",
  name: "Venta directa",
  kind: "direct",
  priceBasis: "retail",
  commissionPct: 0,
  paymentFeePct: 0.03,
  costPerOrder: 0,
  costPerUnit: 0,
  paymentTermsDays: 0,
  isActive: true,
};

export const distributor: Channel = {
  id: "dist",
  name: "Distribuidores",
  kind: "distributor",
  priceBasis: "distributor",
  commissionPct: 0,
  paymentFeePct: 0,
  costPerOrder: 200,
  costPerUnit: 0,
  paymentTermsDays: 30,
  isActive: true,
};

export const online: Channel = {
  id: "online",
  name: "Online",
  kind: "online",
  priceBasis: "retail",
  commissionPct: 0,
  paymentFeePct: 0.05,
  costPerOrder: 0,
  costPerUnit: 10,
  paymentTermsDays: 0,
  isActive: true,
};

export const channels = [direct, distributor, online];

let seq = 0;
export function line(partial: Partial<SaleLine> & Pick<SaleLine, "issueDate" | "channelId" | "quantity" | "revenue" | "cogs">): SaleLine {
  seq += 1;
  return {
    invoiceId: partial.invoiceId ?? `inv-${seq}`,
    invoiceNumber: partial.invoiceNumber ?? `FAC-${seq}`,
    counterpartyKey: partial.counterpartyKey ?? "anon",
    counterpartyLabel: partial.counterpartyLabel ?? "Consumidor final",
    productId: partial.productId ?? "candle",
    productLabel: partial.productLabel ?? "Vela lavanda",
    listPrice: partial.listPrice ?? partial.revenue / partial.quantity,
    unitPrice: partial.unitPrice ?? partial.revenue / partial.quantity,
    ...partial,
  } as SaleLine;
}
