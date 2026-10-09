import { describe, expect, it } from "vitest";
import { analyzeOrder, standardConsumption, summarizeProduction, type CompletedOrder } from "../production";

const order: CompletedOrder = {
  id: "op1",
  number: "OP-00001",
  productId: "candle",
  productName: "Vela lavanda",
  completedDate: "2026-09-11",
  plannedQuantity: 20,
  producedQuantity: 20,
  laborHours: 5,
  standardLaborHours: 4,
  laborCost: 500,
  standardLaborCost: 400,
  laborInUnitCost: false,
  standardUnitCost: 170,
  actualUnitCost: 162,
  consumptions: [
    { materialId: "wax", materialName: "Cera", unit: "g", standardQuantity: 4000, actualQuantity: 4400, standardPrice: 0.7, unitCost: 0.6 },
    { materialId: "frag", materialName: "Fragancia", unit: "ml", standardQuantity: 200, actualQuantity: 200, standardPrice: 3, unitCost: 3 },
  ],
};

describe("analyzeOrder", () => {
  const v = analyzeOrder(order);

  it("splits the material variance into usage and price exactly", () => {
    expect(v.standardCost).toBeCloseTo(3400);
    expect(v.actualCost).toBeCloseTo(3240);
    expect(v.materialUsageVariance).toBeCloseTo(240);
    expect(v.materialPriceVariance).toBeCloseTo(-400);
    expect(v.totalVariance).toBeCloseTo(v.materialUsageVariance + v.materialPriceVariance);
  });

  it("reports the over-used material first and labor time variance", () => {
    expect(v.materials[0].materialId).toBe("wax");
    expect(v.materials[0].usageVariancePct).toBeCloseTo(0.1);
    expect(v.laborVariance).toBeCloseTo(100);
    expect(v.yieldPct).toBe(1);
  });
});

describe("labor in unit cost", () => {
  it("adds labor to standard and actual cost when it is paid per hour or per piece", () => {
    const v = analyzeOrder({ ...order, laborInUnitCost: true });
    expect(v.standardCost).toBeCloseTo(3400 + 400);
    expect(v.actualCost).toBeCloseTo(3240 + 500);
    expect(v.totalVariance).toBeCloseTo(v.materialUsageVariance + v.materialPriceVariance + v.laborVariance);
  });

  it("has no labor variance when paid per piece produced", () => {
    const v = analyzeOrder({ ...order, laborInUnitCost: true, laborCost: 240, standardLaborCost: 240 });
    expect(v.laborVariance).toBe(0);
  });
});

describe("summarizeProduction", () => {
  it("aggregates by product and finds the worst material", () => {
    const second: CompletedOrder = { ...order, id: "op2", number: "OP-00002", plannedQuantity: 20, producedQuantity: 18 };
    const summary = summarizeProduction([order, second]);
    expect(summary.products).toHaveLength(1);
    expect(summary.products[0].averageYieldPct).toBeCloseTo(38 / 40);
    expect(summary.products[0].worstMaterial?.materialId).toBe("wax");
  });
});

describe("standardConsumption", () => {
  it("scales the recipe to the quantity", () => {
    expect(standardConsumption([{ materialId: "wax", quantity: 2000 }], 10, 25)).toEqual([{ materialId: "wax", quantity: 5000 }]);
  });
});
