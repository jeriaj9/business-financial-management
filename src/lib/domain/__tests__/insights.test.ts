import { describe, expect, it } from "vitest";
import { buildMonthlyReport, decomposeGrossProfit } from "../insights";
import type { MaterialCostChange, SaleLine } from "../types";
import { candle, channels, fragrance, line, sachet, wax } from "./fixtures";

function randomLines(seed: number, month: string): SaleLine[] {
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  const products = ["candle", "sachet", "diffuser"];
  const chans = ["direct", "dist", "online"];
  return Array.from({ length: 25 }, () => {
    const quantity = 1 + Math.floor(rand() * 20);
    const price = 20 + rand() * 400;
    const cost = price * (0.2 + rand() * 0.6);
    return line({
      issueDate: `${month}-${String(1 + Math.floor(rand() * 27)).padStart(2, "0")}`,
      channelId: chans[Math.floor(rand() * chans.length)],
      productId: products[Math.floor(rand() * products.length)],
      quantity,
      revenue: quantity * price,
      cogs: quantity * cost,
    });
  });
}

describe("decomposeGrossProfit", () => {
  it("volume + mix + price + cost always equals the change in gross profit", () => {
    for (let seed = 1; seed <= 25; seed++) {
      const d = decomposeGrossProfit(randomLines(seed, "2026-08"), randomLines(seed + 100, "2026-09"));
      expect(d.volume + d.mix + d.price + d.cost).toBeCloseTo(d.delta, 6);
    }
  });

  it("attributes a pure price change to price and a pure cost change to cost", () => {
    const prev = [line({ issueDate: "2026-08-10", channelId: "direct", quantity: 10, revenue: 4000, cogs: 1300 })];
    const pricier = [line({ issueDate: "2026-09-10", channelId: "direct", quantity: 10, revenue: 4500, cogs: 1300 })];
    const costlier = [line({ issueDate: "2026-09-10", channelId: "direct", quantity: 10, revenue: 4000, cogs: 1500 })];
    expect(decomposeGrossProfit(prev, pricier)).toMatchObject({ volume: 0, mix: 0, price: 500, cost: 0 });
    expect(decomposeGrossProfit(prev, costlier)).toMatchObject({ volume: 0, mix: 0, price: 0, cost: -200 });
  });

  it("captures a shift toward a lower-margin channel as mix", () => {
    const prev = [
      line({ issueDate: "2026-08-10", channelId: "direct", quantity: 10, revenue: 4000, cogs: 1300 }),
      line({ issueDate: "2026-08-10", channelId: "dist", quantity: 10, revenue: 3200, cogs: 1300 }),
    ];
    const curr = [
      line({ issueDate: "2026-09-10", channelId: "direct", quantity: 5, revenue: 2000, cogs: 650 }),
      line({ issueDate: "2026-09-10", channelId: "dist", quantity: 15, revenue: 4800, cogs: 1950 }),
    ];
    const d = decomposeGrossProfit(prev, curr);
    expect(d.volume).toBeCloseTo(0);
    expect(d.mix).toBeCloseTo(-400);
    expect(d.delta).toBeCloseTo(-400);
  });
});

describe("buildMonthlyReport", () => {
  const history: MaterialCostChange[] = [
    { materialId: "wax", effectiveAt: "2026-01-01T00:00:00Z", previousCost: null, newCost: 0.5, source: "initial" },
    { materialId: "wax", effectiveAt: "2026-09-02T00:00:00Z", previousCost: 0.5, newCost: 0.6, source: "purchase" },
  ];
  const sales = [
    line({ issueDate: "2026-08-05", channelId: "direct", quantity: 10, revenue: 4000, cogs: 1300 }),
    line({ issueDate: "2026-09-05", channelId: "direct", quantity: 10, revenue: 4000, cogs: 1500 }),
    line({ issueDate: "2026-09-06", channelId: "dist", productId: "sachet", productLabel: "Sachet", quantity: 1, revenue: 30, cogs: 9, invoiceId: "small" }),
  ];
  const report = buildMonthlyReport({
    month: "2026-09-01",
    asOf: "2026-09-30",
    sales,
    expenses: [
      { id: "1", date: "2026-08-10", category: "Alquiler", amount: 1000, isRecurring: true },
      { id: "2", date: "2026-09-10", category: "Alquiler", amount: 1000, isRecurring: true },
      { id: "3", date: "2026-09-12", category: "Publicidad", amount: 500, isRecurring: false },
    ],
    channels,
    products: [candle, sachet],
    materials: [{ ...wax, costPerUnit: 0.6 }, fragrance],
    costHistory: history,
    receivables: [{ id: "r", number: "FAC-1", dueDate: "2026-09-01", balance: 300, counterpartyLabel: "Norte" }],
    labels: { product: (id) => (id === "candle" ? "Vela lavanda" : "Sachet"), channel: (id) => channels.find((c) => c.id === id)!.name },
  });

  it("explains the cost increase through the material that caused it", () => {
    const cost = report.insights.find((i) => i.kind === "cost");
    expect(cost).toMatchObject({ kind: "cost", tone: "negative", materialName: "Cera de soya" });
    expect(report.materialDrivers[0].impact).toBeCloseTo(-200);
  });

  it("reports expenses, loss makers and overdue receivables", () => {
    expect(report.insights.find((i) => i.kind === "expenses")).toMatchObject({ categoryLabel: "Publicidad", categoryDelta: 500 });
    expect(report.insights.find((i) => i.kind === "loss_maker")).toMatchObject({ productLabel: "Sachet", channelLabel: "Distribuidores" });
    expect(report.insights.find((i) => i.kind === "receivables")).toMatchObject({ amount: 300, overdue: 300 });
    expect(report.current.expenses).toBe(1500);
  });

  it("compares a month in progress with the same days of the previous month", () => {
    const partial = buildMonthlyReport({
      month: "2026-09-01",
      asOf: "2026-09-05",
      sales,
      expenses: [],
      channels,
      products: [candle],
      materials: [wax],
      costHistory: history,
      receivables: [],
      labels: { product: () => "x", channel: () => "y" },
    });
    expect(partial.current.to).toBe("2026-09-05");
    expect(partial.previous.to).toBe("2026-08-05");
    expect(partial.previous.revenue).toBe(4000);
  });
});
