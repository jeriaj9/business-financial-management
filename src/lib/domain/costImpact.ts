// Opportunity 2: what a change in an input cost does to each product, how much margin it has
// cost so far, and which price restores the margin.
import { computeProductCost, marginOnPrice, round2 } from "./costing";
import { addDays, dayNumber, diffDays, type ISODate } from "./dates";
import type { CostSettings, Material, MaterialCostChange, Product, ProductPriceChange, SaleLine } from "./types";

export interface AffectedProduct {
  productId: string;
  productName: string;
  materialPerUnit: number;
  variableCostDelta: number; // per unit, what COGS moves by
  fullCostDelta: number; // per unit, including the overhead reserve
  monthlyUnits: number;
  monthlyImpact: number; // variableCostDelta x monthlyUnits
  unitsSinceChange: number;
  impactSinceChange: number;
  priceAdjustedSince: boolean;
}

export interface CostChangeImpact {
  materialId: string;
  materialName: string;
  unit: string;
  effectiveAt: string;
  previousCost: number;
  newCost: number;
  changePct: number;
  source: MaterialCostChange["source"];
  affected: AffectedProduct[];
  monthlyImpact: number;
  impactSinceChange: number;
  unadjustedProducts: number;
}

export interface RepricingSuggestion {
  productId: string;
  productName: string;
  lastPriceChangeAt: string | null;
  retailPrice: number;
  distributorPrice: number | null; // explicit list price, null when it follows the default discount
  fullCostThen: number;
  fullCostNow: number;
  marginThen: number;
  marginNow: number;
  marginDropPts: number; // percentage points (positive = worse)
  keepMarginRetail: number; // price that restores the margin % on price
  keepMarginDistributor: number | null;
  keepAmountRetail: number; // price that restores the money margin per unit
  monthlyUnits: number;
  monthlyGap: number; // margin lost per month at the current price
  needsReview: boolean;
}

export interface CostImpactResult {
  changes: CostChangeImpact[];
  repricing: RepricingSuggestion[];
  totals: {
    monthlyImpact: number;
    impactSinceChanges: number;
    productsToReview: number;
  };
}

export interface CostImpactInput {
  asOf: ISODate;
  materials: Material[];
  products: Product[];
  costHistory: MaterialCostChange[];
  priceHistory: ProductPriceChange[];
  sales: SaleLine[];
  settings: CostSettings;
  windowDays?: number;
  volumeLookbackDays?: number;
  reviewThresholdPts?: number;
}

function timeOf(value: string): number {
  return new Date(value.length <= 10 ? `${value}T00:00:00` : value).getTime();
}

/** Cost of a material as of a moment, reconstructed from its history. */
export function materialCostAt(history: MaterialCostChange[], materialId: string, at: string, fallback: number): number {
  const entries = history
    .filter((h) => h.materialId === materialId)
    .sort((a, b) => timeOf(a.effectiveAt) - timeOf(b.effectiveAt));
  if (entries.length === 0) return fallback;

  const atTime = timeOf(at);
  let cost: number | null = null;
  for (const entry of entries) {
    if (timeOf(entry.effectiveAt) <= atTime) cost = entry.newCost;
  }
  if (cost !== null) return cost;
  return entries[0].previousCost ?? entries[0].newCost;
}

export function monthlyUnitsByProduct(sales: SaleLine[], asOf: ISODate, lookbackDays: number): Map<string, number> {
  const from = addDays(asOf, -lookbackDays + 1);
  const units = new Map<string, number>();
  for (const line of sales) {
    if (!line.productId) continue;
    if (dayNumber(line.issueDate) < dayNumber(from) || dayNumber(line.issueDate) > dayNumber(asOf)) continue;
    units.set(line.productId, (units.get(line.productId) ?? 0) + line.quantity);
  }
  const months = lookbackDays / 30;
  for (const [key, value] of units) units.set(key, value / months);
  return units;
}

export function analyzeCostImpact(input: CostImpactInput): CostImpactResult {
  const windowDays = input.windowDays ?? 180;
  const lookback = input.volumeLookbackDays ?? 90;
  const threshold = input.reviewThresholdPts ?? 2;
  const materialById = new Map(input.materials.map((m) => [m.id, m]));
  const monthlyUnits = monthlyUnitsByProduct(input.sales, input.asOf, lookback);
  const windowStart = addDays(input.asOf, -windowDays);

  const lastPriceChange = new Map<string, string>();
  for (const change of input.priceHistory) {
    const current = lastPriceChange.get(change.productId);
    if (!current || timeOf(change.effectiveAt) > timeOf(current)) lastPriceChange.set(change.productId, change.effectiveAt);
  }

  const reserveFactor = 1 + input.settings.indirectCostReserve;

  // --- cost change events in the window
  const changes: CostChangeImpact[] = input.costHistory
    .filter(
      (h) =>
        h.previousCost !== null &&
        h.previousCost !== h.newCost &&
        diffDays(h.effectiveAt.slice(0, 10), windowStart) >= 0 &&
        diffDays(input.asOf, h.effectiveAt.slice(0, 10)) >= 0
    )
    .map((h) => {
      const material = materialById.get(h.materialId);
      const delta = h.newCost - (h.previousCost as number);
      const changeDay = h.effectiveAt.slice(0, 10);

      const affected: AffectedProduct[] = input.products
        .filter((p) => p.batchSize > 0 && p.recipe.some((r) => r.materialId === h.materialId))
        .map((p) => {
          const perBatch = p.recipe.filter((r) => r.materialId === h.materialId).reduce((s, r) => s + r.quantity, 0);
          const perUnit = perBatch / p.batchSize;
          const variableCostDelta = perUnit * delta;
          const unitsSince = input.sales
            .filter((s) => s.productId === p.id && dayNumber(s.issueDate) >= dayNumber(changeDay) && dayNumber(s.issueDate) <= dayNumber(input.asOf))
            .reduce((s, l) => s + l.quantity, 0);
          const monthly = monthlyUnits.get(p.id) ?? 0;
          const lastPrice = lastPriceChange.get(p.id);
          return {
            productId: p.id,
            productName: p.name,
            materialPerUnit: perUnit,
            variableCostDelta,
            fullCostDelta: variableCostDelta * reserveFactor,
            monthlyUnits: monthly,
            monthlyImpact: variableCostDelta * monthly,
            unitsSinceChange: unitsSince,
            impactSinceChange: variableCostDelta * unitsSince,
            priceAdjustedSince: lastPrice ? timeOf(lastPrice) > timeOf(h.effectiveAt) : false,
          };
        })
        .sort((a, b) => Math.abs(b.monthlyImpact) - Math.abs(a.monthlyImpact));

      return {
        materialId: h.materialId,
        materialName: material?.name ?? "Materia prima",
        unit: material?.unit ?? "",
        effectiveAt: h.effectiveAt,
        previousCost: h.previousCost as number,
        newCost: h.newCost,
        changePct: (h.previousCost as number) > 0 ? delta / (h.previousCost as number) : 0,
        source: h.source,
        affected,
        monthlyImpact: affected.reduce((s, a) => s + a.monthlyImpact, 0),
        impactSinceChange: affected.reduce((s, a) => s + a.impactSinceChange, 0),
        unadjustedProducts: affected.filter((a) => !a.priceAdjustedSince && a.variableCostDelta > 0).length,
      };
    })
    .sort((a, b) => timeOf(b.effectiveAt) - timeOf(a.effectiveAt));

  // --- repricing: compare today's cost with the cost when the price was last set
  const currentCost = (id: string) => materialById.get(id)?.costPerUnit ?? 0;

  const repricing: RepricingSuggestion[] = input.products
    .filter((p) => p.isActive && p.retailPrice > 0 && p.recipe.length > 0)
    .map((p) => {
      const lastChange = lastPriceChange.get(p.id) ?? null;
      const now = computeProductCost(p, currentCost, input.settings);
      const then = lastChange
        ? computeProductCost(p, (id) => materialCostAt(input.costHistory, id, lastChange, currentCost(id)), input.settings)
        : now;

      const marginThen = marginOnPrice(p.retailPrice, then.full);
      const marginNow = marginOnPrice(p.retailPrice, now.full);
      const costRatio = then.full > 0 ? now.full / then.full : 1;
      const monthly = monthlyUnits.get(p.id) ?? 0;
      const marginDropPts = (marginThen - marginNow) * 100;

      return {
        productId: p.id,
        productName: p.name,
        lastPriceChangeAt: lastChange,
        retailPrice: p.retailPrice,
        distributorPrice: p.distributorPrice,
        fullCostThen: then.full,
        fullCostNow: now.full,
        marginThen,
        marginNow,
        marginDropPts,
        keepMarginRetail: round2(p.retailPrice * costRatio),
        keepMarginDistributor: p.distributorPrice !== null ? round2(p.distributorPrice * costRatio) : null,
        keepAmountRetail: round2(p.retailPrice + (now.full - then.full)),
        monthlyUnits: monthly,
        monthlyGap: (now.full - then.full) * monthly,
        needsReview: marginDropPts >= threshold,
      };
    })
    .sort((a, b) => b.marginDropPts - a.marginDropPts);

  return {
    changes,
    repricing,
    totals: {
      monthlyImpact: changes.reduce((s, c) => s + c.monthlyImpact, 0),
      impactSinceChanges: changes.reduce((s, c) => s + c.impactSinceChange, 0),
      productsToReview: repricing.filter((r) => r.needsReview).length,
    },
  };
}
