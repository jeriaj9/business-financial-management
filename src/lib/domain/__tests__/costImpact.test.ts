import { describe, expect, it } from "vitest";
import { analyzeCostImpact, materialCostAt } from "../costImpact";
import type { MaterialCostChange } from "../types";
import { candle, fragrance, line, sachet, settings, wax } from "./fixtures";

const history: MaterialCostChange[] = [
  { materialId: "wax", effectiveAt: "2026-01-01T10:00:00Z", previousCost: null, newCost: 0.5, source: "initial" },
  { materialId: "frag", effectiveAt: "2026-01-01T10:00:00Z", previousCost: null, newCost: 3, source: "initial" },
  { materialId: "wax", effectiveAt: "2026-09-01T10:00:00Z", previousCost: 0.5, newCost: 0.6, source: "purchase" },
];

describe("materialCostAt", () => {
  it("reconstructs the cost in force at a given moment", () => {
    expect(materialCostAt(history, "wax", "2026-08-31T23:59:59Z", 0.6)).toBe(0.5);
    expect(materialCostAt(history, "wax", "2026-09-15", 0.6)).toBe(0.6);
    expect(materialCostAt(history, "wax", "2025-12-01", 0.6)).toBe(0.5);
    expect(materialCostAt([], "wax", "2026-09-15", 0.6)).toBe(0.6);
  });
});

describe("analyzeCostImpact", () => {
  // 30 candles sold in the last 90 days, 10 of them after the wax price went up
  const sales = [
    line({ issueDate: "2026-07-10", channelId: "direct", quantity: 20, revenue: 8000, cogs: 2600 }),
    line({ issueDate: "2026-09-10", channelId: "direct", quantity: 10, revenue: 4000, cogs: 1500 }),
  ];
  const result = analyzeCostImpact({
    asOf: "2026-09-30",
    materials: [{ ...wax, costPerUnit: 0.6 }, fragrance],
    products: [candle, sachet],
    costHistory: history,
    priceHistory: [{ productId: "candle", effectiveAt: "2026-01-15T00:00:00Z", retailPrice: 400, distributorPrice: null }],
    sales,
    settings,
  });

  it("quantifies the monthly and accumulated impact of a cost change", () => {
    expect(result.changes).toHaveLength(1);
    const change = result.changes[0];
    expect(change.changePct).toBeCloseTo(0.2);
    expect(change.affected.map((a) => a.productId)).toEqual(["candle"]);
    const affected = change.affected[0];
    expect(affected.variableCostDelta).toBeCloseTo(20); // 200 g/unit x 0.10
    expect(affected.monthlyUnits).toBeCloseTo(10);
    expect(affected.monthlyImpact).toBeCloseTo(200);
    expect(affected.impactSinceChange).toBeCloseTo(200);
    expect(affected.priceAdjustedSince).toBe(false);
    expect(change.unadjustedProducts).toBe(1);
  });

  it("suggests prices that restore margin and flags the product for review", () => {
    const candleRepricing = result.repricing.find((r) => r.productId === "candle")!;
    expect(candleRepricing.fullCostThen).toBeCloseTo(165);
    expect(candleRepricing.fullCostNow).toBeCloseTo(187);
    expect(candleRepricing.marginDropPts).toBeCloseTo(5.5);
    expect(candleRepricing.keepMarginRetail).toBeCloseTo(453.33, 2);
    expect(candleRepricing.keepAmountRetail).toBeCloseTo(422);
    expect(candleRepricing.needsReview).toBe(true);
    expect(result.totals.productsToReview).toBe(1);
  });

  it("does not flag a product whose price was updated after the change", () => {
    const adjusted = analyzeCostImpact({
      asOf: "2026-09-30",
      materials: [{ ...wax, costPerUnit: 0.6 }, fragrance],
      products: [{ ...candle, retailPrice: 455 }],
      costHistory: history,
      priceHistory: [
        { productId: "candle", effectiveAt: "2026-01-15T00:00:00Z", retailPrice: 400, distributorPrice: null },
        { productId: "candle", effectiveAt: "2026-09-05T00:00:00Z", retailPrice: 455, distributorPrice: null },
      ],
      sales,
      settings,
    });
    expect(adjusted.changes[0].affected[0].priceAdjustedSince).toBe(true);
    expect(adjusted.repricing[0].needsReview).toBe(false);
  });
});
