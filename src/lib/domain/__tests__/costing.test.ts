import { describe, expect, it } from "vitest";
import { computeProductCost, materialCostMap, priceForMargin, resolveDistributorPrice, marginOnPrice, markupOnCost } from "../costing";
import { candle, fragrance, settings, wax } from "./fixtures";

const costs = materialCostMap([wax, fragrance]);

describe("computeProductCost", () => {
  it("splits full cost (for pricing) from variable cost (for COGS)", () => {
    const c = computeProductCost(candle, costs, settings);
    expect(c.material).toBeCloseTo(130);
    expect(c.labor).toBeCloseTo(20);
    expect(c.overhead).toBeCloseTo(15);
    expect(c.full).toBeCloseTo(165);
    expect(c.variable).toBeCloseTo(130);
  });

  it("includes hourly labor in the cost of goods sold", () => {
    const c = computeProductCost(candle, costs, { ...settings, laborMode: "hourly" });
    expect(c.variable).toBeCloseTo(150);
    expect(c.full).toBeCloseTo(165);
  });

  it("uses the product's piece rate when labor is paid per piece", () => {
    const c = computeProductCost({ ...candle, laborCostPerPiece: 12 }, costs, { ...settings, laborMode: "piece" });
    expect(c.labor).toBeCloseTo(12);
    expect(c.variable).toBeCloseTo(142);
    expect(c.full).toBeCloseTo((130 + 12) * 1.1);
  });

  it("returns zero costs for an invalid batch size", () => {
    expect(computeProductCost({ ...candle, batchSize: 0 }, costs, settings).full).toBe(0);
  });
});

describe("pricing helpers", () => {
  it("resolves distributor price: override, then product list price, then default discount", () => {
    expect(resolveDistributorPrice(400, 300, 0.3, 0.2)).toBe(280);
    expect(resolveDistributorPrice(400, 300, null, 0.2)).toBe(300);
    expect(resolveDistributorPrice(400, null, null, 0.2)).toBe(320);
  });

  it("converts between margin and markup", () => {
    expect(marginOnPrice(400, 165)).toBeCloseTo(0.5875);
    expect(markupOnCost(412.5, 165)).toBeCloseTo(1.5);
    expect(priceForMargin(165, 0.5)).toBeCloseTo(330);
  });
});
