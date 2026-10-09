import { describe, expect, it } from "vitest";
import { buildBaseline, emptyScenario, simulate } from "../simulator";
import { candle, channels, fragrance, line, sachet, settings, wax } from "./fixtures";

const baseline = buildBaseline({
  asOf: "2026-09-30",
  lookbackDays: 90,
  sales: [
    line({ invoiceId: "a", issueDate: "2026-07-15", channelId: "direct", quantity: 30, revenue: 12000, cogs: 3900 }),
    line({ invoiceId: "b", issueDate: "2026-08-01", channelId: "dist", productId: "sachet", productLabel: "Sachet", quantity: 20, revenue: 600, cogs: 180 }),
    line({ invoiceId: "c", issueDate: "2026-08-15", channelId: "dist", productId: "sachet", productLabel: "Sachet", quantity: 20, revenue: 600, cogs: 180 }),
    line({ invoiceId: "d", issueDate: "2026-09-01", channelId: "dist", productId: "sachet", productLabel: "Sachet", quantity: 20, revenue: 600, cogs: 180 }),
    line({ invoiceId: "old", issueDate: "2026-05-01", channelId: "direct", quantity: 999, revenue: 1, cogs: 1 }),
  ],
  products: [candle, sachet],
  materials: [wax, fragrance],
  channels,
  expenses: [{ id: "e1", date: "2026-08-01", category: "Alquiler", amount: 9000, isRecurring: true }],
  settings,
});

describe("simulator baseline", () => {
  it("builds monthly volumes, prices and fixed costs from the lookback window", () => {
    const candleItem = baseline.items.find((i) => i.productId === "candle")!;
    expect(candleItem.monthlyUnits).toBeCloseTo(10);
    expect(candleItem.netPrice).toBeCloseTo(400);
    expect(baseline.unitsPerOrder.dist).toBeCloseTo(20);
    expect(baseline.fixedCostsMonthly).toBeCloseTo(3000);
  });

  it("computes contribution, operating profit and break-even", () => {
    const { baseline: base } = simulate(baseline, emptyScenario);
    expect(base.revenue).toBeCloseTo(4600);
    expect(base.contribution).toBeCloseTo(2580 + 220);
    expect(base.operatingProfit).toBeCloseTo(-200);
    expect(base.breakEvenRevenue).toBeCloseTo(3000 / (2800 / 4600));
  });
});

describe("scenarios", () => {
  it("a price increase raises revenue and channel fees proportionally", () => {
    const r = simulate(baseline, { ...emptyScenario, globalPricePct: 0.1 });
    expect(r.scenario.revenue).toBeCloseTo(5060);
    expect(r.scenario.contribution).toBeCloseTo(2968 + 280);
    expect(r.delta.operatingProfit).toBeCloseTo(448);
  });

  it("an input cost increase flows through the recipe", () => {
    const r = simulate(baseline, { ...emptyScenario, materialCostPct: { wax: 0.2 } });
    expect(r.scenario.variableCosts).toBeCloseTo(1500 + 180);
  });

  it("shifting volume to distributors uses the distributor price", () => {
    const r = simulate(baseline, { ...emptyScenario, channelShift: { fromChannelId: "direct", toChannelId: "dist", pct: 0.5 } });
    const moved = r.scenario.items.find((i) => i.productId === "candle" && i.channelId === "dist")!;
    expect(moved.units).toBeCloseTo(5);
    expect(moved.price).toBeCloseTo(320);
    expect(r.scenario.units).toBeCloseTo(r.baseline.units);
  });

  it("a new distributor adds volume at its discount and fixed costs can change", () => {
    const r = simulate(baseline, {
      ...emptyScenario,
      newDistributor: { channelId: "dist", discountPct: 0.3, monthlyUnits: { candle: 10 } },
      fixedCostMonthlyDelta: 1000,
    });
    expect(r.scenario.revenue).toBeCloseTo(4600 + 2800);
    expect(r.scenario.fixedCosts).toBeCloseTo(4000);
  });
});
