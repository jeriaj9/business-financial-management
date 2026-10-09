import { describe, expect, it } from "vitest";
import { analyzeProfitability, costLines } from "../profitability";
import { channels, line } from "./fixtures";

const labels = { channel: (id: string) => channels.find((c) => c.id === id)?.name ?? id };

describe("costLines", () => {
  it("allocates a per-order channel cost across the invoice by revenue", () => {
    const lines = [
      line({ invoiceId: "a", issueDate: "2026-09-01", channelId: "dist", quantity: 4, revenue: 1000, cogs: 520 }),
      line({ invoiceId: "a", issueDate: "2026-09-01", channelId: "dist", productId: "sachet", productLabel: "Sachet", quantity: 10, revenue: 250, cogs: 90 }),
    ];
    const costed = costLines(lines, channels);
    expect(costed[0].channelCost).toBeCloseTo(160);
    expect(costed[1].channelCost).toBeCloseTo(40);
    expect(costed[0].contribution).toBeCloseTo(1000 - 520 - 160);
  });

  it("applies percentage fees and per-unit costs", () => {
    const [costed] = costLines([line({ issueDate: "2026-09-01", channelId: "online", quantity: 2, revenue: 800, cogs: 260 })], channels);
    expect(costed.channelCost).toBeCloseTo(800 * 0.05 + 2 * 10);
  });
});

describe("analyzeProfitability", () => {
  const lines = [
    line({ invoiceId: "1", issueDate: "2026-09-01", channelId: "direct", quantity: 2, revenue: 800, cogs: 260, counterpartyKey: "c:ana", counterpartyLabel: "Ana" }),
    line({ invoiceId: "2", issueDate: "2026-09-02", channelId: "dist", quantity: 1, revenue: 150, cogs: 130, counterpartyKey: "d:norte", counterpartyLabel: "Norte" }),
    line({ invoiceId: "3", issueDate: "2026-09-03", channelId: "online", productId: "sachet", productLabel: "Sachet", quantity: 5, revenue: 200, cogs: 45 }),
  ];
  const result = analyzeProfitability(lines, channels, labels);

  it("totals reconcile with the sum of rows in every dimension", () => {
    const sum = (rows: { contribution: number }[]) => rows.reduce((s, r) => s + r.contribution, 0);
    expect(sum(result.byProduct)).toBeCloseTo(result.totals.contribution);
    expect(sum(result.byChannel)).toBeCloseTo(result.totals.contribution);
    expect(sum(result.byCounterparty)).toBeCloseTo(result.totals.contribution);
    expect(result.totals.invoices).toBe(3);
  });

  it("flags the distributor that loses money once channel costs are included", () => {
    // 150 revenue - 130 cogs - 200 delivery per order = -180
    const norte = result.byCounterparty.find((r) => r.key === "d:norte")!;
    expect(norte.contribution).toBeCloseTo(-180);
    expect(result.lossMakers.map((r) => r.key)).toContain("d:norte");
  });

  it("builds a product x channel matrix", () => {
    const cell = result.matrix.find((c) => c.productId === "candle" && c.channelId === "direct")!;
    expect(cell.revenue).toBe(800);
    expect(cell.margin).toBeCloseTo((800 - 260 - 24) / 800);
  });
});
