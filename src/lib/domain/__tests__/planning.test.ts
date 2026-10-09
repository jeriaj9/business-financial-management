import { describe, expect, it } from "vitest";
import {
  cashPosition,
  forecastWeeklyDemand,
  planMaterials,
  planProduction,
  projectCash,
  recurringExpenseTemplates,
  weeklySalesByChannel,
  weeklyVariableExpenses,
} from "../planning";
import { candle, channels, fragrance, line, sachet, wax } from "./fixtures";

const asOf = "2026-09-30";

describe("forecastWeeklyDemand", () => {
  it("averages units over the lookback weeks", () => {
    const demand = forecastWeeklyDemand(
      [
        line({ issueDate: "2026-09-29", channelId: "direct", quantity: 40, revenue: 16000, cogs: 0 }),
        line({ issueDate: "2026-08-01", channelId: "direct", quantity: 999, revenue: 1, cogs: 0 }),
      ],
      asOf,
      4
    );
    expect(demand.get("candle")).toBeCloseTo(10);
  });
});

describe("planProduction and planMaterials", () => {
  const needs = planProduction({
    asOf,
    products: [candle, sachet],
    weeklyDemand: new Map([["candle", 10]]),
    horizonWeeks: 4,
    safetyWeeks: 1,
    plannedOrders: [],
    committedUnits: new Map([["candle", 5]]),
  });

  it("covers horizon demand, committed orders and safety stock in whole batches", () => {
    const n = needs.find((x) => x.productId === "candle")!;
    // 40 demand + 5 committed + 10 safety - 20 on hand = 35 -> 4 batches of 10
    expect(n.shortfall).toBeCloseTo(35);
    expect(n.batches).toBe(4);
    expect(n.suggestedQuantity).toBe(40);
    // available 15, safety 10 -> 0.5 weeks -> produce within 3 days
    expect(n.produceBy).toBe("2026-10-03");
    expect(n.status).toBe("urgent");
    expect(needs.find((x) => x.productId === "sachet")!.suggestedQuantity).toBe(0);
  });

  it("explodes the plan into material purchases with order-by dates", () => {
    const materials = planMaterials({
      asOf,
      products: [candle, sachet],
      materials: [wax, fragrance],
      productionNeeds: needs,
      plannedOrders: [{ productId: "sachet", quantity: 40, plannedDate: "2026-10-10" }],
      supplierLeadTime: new Map([["sup1", 10]]),
      defaultLeadTimeDays: 7,
    });
    const waxNeed = materials.find((m) => m.materialId === "wax")!;
    expect(waxNeed.required).toBeCloseTo(8000);
    expect(waxNeed.suggestedPurchase).toBe(0); // 10,000 on hand covers 8,000 + 2,000 reorder point
    const fragNeed = materials.find((m) => m.materialId === "frag")!;
    // 40 candles x 10 ml + 40 sachets x 3 ml = 520; +100 reorder point - 500 on hand = 120
    expect(fragNeed.required).toBeCloseTo(520);
    expect(fragNeed.suggestedPurchase).toBeCloseTo(120);
    expect(fragNeed.leadTimeDays).toBe(14);
    expect(fragNeed.orderBy).toBe("2026-09-19");
    expect(fragNeed.status).toBe("late");
    expect(fragNeed.estimatedCost).toBeCloseTo(360);
  });
});

describe("cash", () => {
  it("computes today's cash from the opening balance and movements", () => {
    const cash = cashPosition({
      openingBalance: 10000,
      openingDate: "2026-09-01",
      payments: [
        { direction: "in", date: "2026-09-10", amount: 5000, voided: false },
        { direction: "out", date: "2026-09-12", amount: 2000, voided: false },
        { direction: "in", date: "2026-09-13", amount: 999, voided: true },
        { direction: "in", date: "2026-08-30", amount: 999, voided: false },
      ],
      expenses: [{ id: "e", date: "2026-09-15", category: "Luz", amount: 1000, isRecurring: true }],
      asOf,
    });
    expect(cash).toBe(12000);
    expect(cashPosition({ openingBalance: 1, openingDate: null, payments: [], expenses: [], asOf })).toBeNull();
  });

  it("projects weekly cash and finds the first negative week", () => {
    const projection = projectCash({
      asOf,
      weeks: 4,
      openingCash: 1000,
      receivables: [
        { id: "r1", number: "FAC-1", dueDate: "2026-09-20", balance: 500, counterpartyLabel: "A" },
        { id: "r2", number: "FAC-2", dueDate: "2026-10-15", balance: 2000, counterpartyLabel: "B" },
      ],
      payables: [{ id: "p1", number: "COM-1", dueDate: "2026-10-02", balance: 3000, counterpartyLabel: "S" }],
      salesByChannel: [{ channelId: "direct", weeklyRevenue: 700, collectionDays: 0 }],
      plannedPurchases: [],
      recurringExpenses: [{ label: "Alquiler", amount: 1000, dayOfMonth: 5 }],
      weeklyVariableExpenses: 0,
    });
    expect(projection.overdueReceivables).toBe(500);
    expect(projection.weeks[0].receivables).toBe(500);
    expect(projection.weeks[0].payables).toBe(3000);
    expect(projection.weeks[0].forecastSales).toBeCloseTo(700);
    expect(projection.weeks[0].expenses).toBe(1000); // rent on Oct 5 falls in the first week (Oct 1 - Oct 7)
    expect(projection.weeks[0].closing).toBeCloseTo(1000 + 500 + 700 - 3000 - 1000);
    expect(projection.firstNegativeWeek).toBe("2026-10-01");
    expect(projection.weeks.reduce((s, w) => s + w.forecastSales, 0)).toBeCloseTo(2800);
    expect(projection.weeks[2].receivables).toBe(2000);
  });

  it("derives recurring templates, variable expenses and channel sales", () => {
    const expenses = [
      { id: "1", date: "2026-08-05", category: "Alquiler", amount: 1000, isRecurring: true },
      { id: "2", date: "2026-09-05", category: "Alquiler", amount: 1100, isRecurring: true },
      { id: "3", date: "2026-09-10", category: "Publicidad", amount: 1300, isRecurring: false },
    ];
    expect(recurringExpenseTemplates(expenses, asOf)).toEqual([{ label: "Alquiler", amount: 1100, dayOfMonth: 5 }]);
    expect(weeklyVariableExpenses(expenses, asOf, 91)).toBeCloseTo(100);
    const byChannel = weeklySalesByChannel(
      [line({ issueDate: "2026-09-29", channelId: "dist", quantity: 1, revenue: 400, cogs: 0 })],
      channels,
      asOf,
      4
    );
    expect(byChannel).toEqual([{ channelId: "dist", weeklyRevenue: 100, collectionDays: 30 }]);
  });
});
