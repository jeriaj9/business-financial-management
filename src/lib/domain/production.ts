// Opportunity 3: production at actual vs standard cost. Explains where each batch cost more
// (or less) than the recipe says: material over/under use, material price, labor time, yield.
import type { ISODate } from "./dates";

export interface ConsumptionRecord {
  materialId: string;
  materialName: string;
  unit: string;
  standardQuantity: number;
  actualQuantity: number;
  standardPrice: number; // replacement cost when completed
  unitCost: number; // moving average cost actually charged
}

export interface CompletedOrder {
  id: string;
  number: string;
  productId: string;
  productName: string;
  completedDate: ISODate;
  plannedQuantity: number;
  producedQuantity: number;
  laborHours: number;
  standardLaborHours: number;
  laborCost: number; // what labor cost for this order (hours x rate, or units x piece rate)
  standardLaborCost: number; // what it should have cost per the product's standard
  laborInUnitCost: boolean; // labor paid per hour or per piece is part of the unit cost
  standardUnitCost: number; // product variable cost when completed
  actualUnitCost: number;
  consumptions: ConsumptionRecord[];
}

export interface MaterialVariance {
  materialId: string;
  materialName: string;
  unit: string;
  standardQuantity: number;
  actualQuantity: number;
  usageVariancePct: number; // (actual - standard) / standard
  usageVarianceCost: number; // (actual - standard) x unit cost, positive = over-use
  priceVarianceCost: number; // standard qty x (unit cost - standard price)
}

export interface OrderVariance {
  orderId: string;
  number: string;
  productId: string;
  productName: string;
  completedDate: ISODate;
  yieldPct: number; // produced / planned
  standardCost: number; // what the produced units should have cost (materials at standard price + labor if variable)
  actualCost: number;
  totalVariance: number; // actual - standard, positive = cost overrun
  materialUsageVariance: number;
  materialPriceVariance: number;
  laborVariance: number; // actual - standard labor cost; informational when labor is a fixed salary
  laborInUnitCost: boolean;
  standardUnitCost: number;
  actualUnitCost: number;
  materials: MaterialVariance[];
}

export interface ProductProductionSummary {
  productId: string;
  productName: string;
  orders: number;
  producedQuantity: number;
  averageYieldPct: number;
  totalVariance: number;
  usageVariance: number;
  averageActualUnitCost: number;
  averageStandardUnitCost: number;
  worstMaterial: MaterialVariance | null;
}

export function analyzeOrder(order: CompletedOrder): OrderVariance {
  const materials: MaterialVariance[] = order.consumptions.map((c) => ({
    materialId: c.materialId,
    materialName: c.materialName,
    unit: c.unit,
    standardQuantity: c.standardQuantity,
    actualQuantity: c.actualQuantity,
    usageVariancePct: c.standardQuantity > 0 ? (c.actualQuantity - c.standardQuantity) / c.standardQuantity : c.actualQuantity > 0 ? 1 : 0,
    usageVarianceCost: (c.actualQuantity - c.standardQuantity) * c.unitCost,
    priceVarianceCost: c.standardQuantity * (c.unitCost - c.standardPrice),
  }));

  const standardMaterials = order.consumptions.reduce((s, c) => s + c.standardQuantity * c.standardPrice, 0);
  const actualMaterials = order.consumptions.reduce((s, c) => s + c.actualQuantity * c.unitCost, 0);
  const laborVariance = order.laborCost - order.standardLaborCost;
  const standardLabor = order.laborInUnitCost ? order.standardLaborCost : 0;
  const actualLabor = order.laborInUnitCost ? order.laborCost : 0;

  const standardCost = standardMaterials + standardLabor;
  const actualCost = actualMaterials + actualLabor;

  return {
    orderId: order.id,
    number: order.number,
    productId: order.productId,
    productName: order.productName,
    completedDate: order.completedDate,
    yieldPct: order.plannedQuantity > 0 ? order.producedQuantity / order.plannedQuantity : 0,
    standardCost,
    actualCost,
    totalVariance: actualCost - standardCost,
    materialUsageVariance: materials.reduce((s, m) => s + m.usageVarianceCost, 0),
    materialPriceVariance: materials.reduce((s, m) => s + m.priceVarianceCost, 0),
    laborVariance,
    laborInUnitCost: order.laborInUnitCost,
    standardUnitCost: order.standardUnitCost,
    actualUnitCost: order.actualUnitCost,
    materials: materials.sort((a, b) => Math.abs(b.usageVarianceCost) - Math.abs(a.usageVarianceCost)),
  };
}

export function summarizeProduction(orders: CompletedOrder[]): {
  orders: OrderVariance[];
  products: ProductProductionSummary[];
  totals: { totalVariance: number; usageVariance: number; priceVariance: number; producedQuantity: number };
} {
  const analyzed = orders.map(analyzeOrder);
  const byProduct = new Map<string, OrderVariance[]>();
  for (const o of analyzed) {
    byProduct.set(o.productId, [...(byProduct.get(o.productId) ?? []), o]);
  }

  const products: ProductProductionSummary[] = [...byProduct.entries()].map(([productId, list]) => {
    const source = orders.filter((o) => o.productId === productId);
    const produced = source.reduce((s, o) => s + o.producedQuantity, 0);
    const planned = source.reduce((s, o) => s + o.plannedQuantity, 0);

    // Aggregate material variances across orders
    const materialTotals = new Map<string, MaterialVariance>();
    for (const order of list) {
      for (const m of order.materials) {
        const acc = materialTotals.get(m.materialId) ?? { ...m, standardQuantity: 0, actualQuantity: 0, usageVarianceCost: 0, priceVarianceCost: 0 };
        acc.standardQuantity += m.standardQuantity;
        acc.actualQuantity += m.actualQuantity;
        acc.usageVarianceCost += m.usageVarianceCost;
        acc.priceVarianceCost += m.priceVarianceCost;
        acc.usageVariancePct = acc.standardQuantity > 0 ? (acc.actualQuantity - acc.standardQuantity) / acc.standardQuantity : 0;
        materialTotals.set(m.materialId, acc);
      }
    }
    const worst = [...materialTotals.values()].sort((a, b) => b.usageVarianceCost - a.usageVarianceCost)[0] ?? null;

    return {
      productId,
      productName: list[0].productName,
      orders: list.length,
      producedQuantity: produced,
      averageYieldPct: planned > 0 ? produced / planned : 0,
      totalVariance: list.reduce((s, o) => s + o.totalVariance, 0),
      usageVariance: list.reduce((s, o) => s + o.materialUsageVariance, 0),
      averageActualUnitCost: produced > 0 ? source.reduce((s, o) => s + o.actualUnitCost * o.producedQuantity, 0) / produced : 0,
      averageStandardUnitCost: produced > 0 ? source.reduce((s, o) => s + o.standardUnitCost * o.producedQuantity, 0) / produced : 0,
      worstMaterial: worst && worst.usageVarianceCost > 0 ? worst : null,
    };
  });

  return {
    orders: analyzed,
    products: products.sort((a, b) => b.totalVariance - a.totalVariance),
    totals: {
      totalVariance: analyzed.reduce((s, o) => s + o.totalVariance, 0),
      usageVariance: analyzed.reduce((s, o) => s + o.materialUsageVariance, 0),
      priceVariance: analyzed.reduce((s, o) => s + o.materialPriceVariance, 0),
      producedQuantity: orders.reduce((s, o) => s + o.producedQuantity, 0),
    },
  };
}

/** Standard material needs for a planned quantity, used to pre-fill the completion form and check stock. */
export function standardConsumption(
  recipe: { materialId: string; quantity: number }[],
  batchSize: number,
  quantity: number
): { materialId: string; quantity: number }[] {
  if (!(batchSize > 0)) return [];
  const totals = new Map<string, number>();
  for (const line of recipe) {
    totals.set(line.materialId, (totals.get(line.materialId) ?? 0) + (line.quantity / batchSize) * quantity);
  }
  return [...totals.entries()].map(([materialId, q]) => ({ materialId, quantity: q }));
}
