// Product costing and pricing. Mirrors trg_products_compute_costs and resolve_distributor_price
// in the database so previews in the browser match what the server stores.
import { laborInCostOfGoods, type CostSettings, type RecipeLine } from "./types";

export interface ProductCostInput {
  batchSize: number;
  productionTimeHours: number;
  laborCostPerPiece?: number;
  recipe: RecipeLine[];
}

export interface ProductCost {
  material: number; // per unit
  labor: number; // per unit
  overhead: number; // per unit (indirect reserve, used for pricing only)
  full: number; // material + labor + overhead: the cost a price must recover
  variable: number; // material (+ labor when paid per hour or per piece): the cost of goods sold
}

export type MaterialCostLookup = (materialId: string) => number;

export function computeProductCost(
  input: ProductCostInput,
  materialCost: MaterialCostLookup,
  settings: Pick<CostSettings, "laborCostPerHour" | "indirectCostReserve" | "laborMode">
): ProductCost {
  const batch = input.batchSize;
  const material = batch > 0 ? input.recipe.reduce((sum, line) => sum + line.quantity * materialCost(line.materialId), 0) / batch : 0;
  const labor =
    settings.laborMode === "piece"
      ? input.laborCostPerPiece ?? 0
      : batch > 0
        ? ((input.productionTimeHours || 0) * settings.laborCostPerHour) / batch
        : 0;
  const overhead = (material + labor) * settings.indirectCostReserve;

  return {
    material,
    labor,
    overhead,
    full: material + labor + overhead,
    variable: material + (laborInCostOfGoods(settings.laborMode) ? labor : 0),
  };
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Distributor price: per-distributor discount, else the product's own list, else the default discount. */
export function resolveDistributorPrice(
  retailPrice: number,
  productDistributorPrice: number | null,
  distributorMarginOverride: number | null,
  defaultDistributorMargin: number
): number {
  if (distributorMarginOverride !== null && distributorMarginOverride !== undefined) {
    return round2(retailPrice * (1 - distributorMarginOverride));
  }
  if (productDistributorPrice !== null && productDistributorPrice !== undefined) {
    return productDistributorPrice;
  }
  return round2(retailPrice * (1 - defaultDistributorMargin));
}

/** Gross margin as a share of price: (price - cost) / price. */
export function marginOnPrice(price: number, cost: number): number {
  return price > 0 ? (price - cost) / price : 0;
}

/** Markup over cost: price / cost - 1. */
export function markupOnCost(price: number, cost: number): number {
  return cost > 0 ? price / cost - 1 : 0;
}

/** Price needed to reach a target margin on price. */
export function priceForMargin(cost: number, targetMargin: number): number {
  if (targetMargin >= 1) return Infinity;
  return cost / (1 - targetMargin);
}

export function materialCostMap(materials: { id: string; costPerUnit: number }[]): MaterialCostLookup {
  const map = new Map(materials.map((m) => [m.id, m.costPerUnit]));
  return (id) => map.get(id) ?? 0;
}
