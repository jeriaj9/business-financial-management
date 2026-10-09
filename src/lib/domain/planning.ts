// Opportunity 5: purchase and production plan tied to cash.
// "To cover the next weeks of demand, produce X, buy Y before day Z; it costs W and this is
// what your cash looks like week by week."
import { standardConsumption } from "./production";
import { addDays, addMonths, dayNumber, diffDays, endOfMonth, startOfMonth, type ISODate } from "./dates";
import type { Channel, Expense, Material, OpenDocument, Product, SaleLine } from "./types";

// ---------------------------------------------------------------------------
// Demand
// ---------------------------------------------------------------------------
export function forecastWeeklyDemand(sales: SaleLine[], asOf: ISODate, lookbackWeeks: number): Map<string, number> {
  const from = dayNumber(addDays(asOf, -lookbackWeeks * 7 + 1));
  const to = dayNumber(asOf);
  const units = new Map<string, number>();
  for (const s of sales) {
    if (!s.productId) continue;
    const d = dayNumber(s.issueDate);
    if (d < from || d > to) continue;
    units.set(s.productId, (units.get(s.productId) ?? 0) + s.quantity);
  }
  for (const [k, v] of units) units.set(k, v / lookbackWeeks);
  return units;
}

// ---------------------------------------------------------------------------
// Production
// ---------------------------------------------------------------------------
export type PlanStatus = "ok" | "soon" | "urgent";

export interface ProductionNeed {
  productId: string;
  productName: string;
  weeklyDemand: number;
  horizonDemand: number;
  committedUnits: number; // submitted distributor orders
  safetyStock: number;
  onHand: number;
  plannedProduction: number; // open (planned) production orders
  shortfall: number;
  suggestedQuantity: number; // rounded up to whole batches
  batches: number;
  weeksOfCover: number | null; // null when there is no demand
  produceBy: ISODate | null;
  status: PlanStatus;
}

export interface PlannedOrderInput {
  productId: string;
  quantity: number;
  plannedDate: ISODate;
}

export function planProduction(params: {
  asOf: ISODate;
  products: Product[];
  weeklyDemand: Map<string, number>;
  horizonWeeks: number;
  safetyWeeks: number;
  plannedOrders: PlannedOrderInput[];
  committedUnits: Map<string, number>;
}): ProductionNeed[] {
  const { asOf, horizonWeeks, safetyWeeks } = params;

  return params.products
    .filter((p) => p.isActive && p.recipe.length > 0)
    .map((p) => {
      const weekly = params.weeklyDemand.get(p.id) ?? 0;
      const committed = params.committedUnits.get(p.id) ?? 0;
      const planned = params.plannedOrders.filter((o) => o.productId === p.id).reduce((s, o) => s + o.quantity, 0);
      const horizonDemand = weekly * horizonWeeks;
      const safety = weekly * safetyWeeks;
      const onHand = Math.max(p.currentStock, 0);
      const shortfall = horizonDemand + committed + safety - onHand - planned;
      const batch = p.batchSize > 0 ? p.batchSize : 1;
      const batches = shortfall > 0 ? Math.ceil(shortfall / batch) : 0;

      const available = onHand + planned - committed;
      let weeksOfCover: number | null = null;
      let produceBy: ISODate | null = null;
      if (weekly > 0) {
        weeksOfCover = Math.max(available, 0) / weekly;
        const weeksUntilSafety = Math.max((available - safety) / weekly, 0);
        produceBy = addDays(asOf, Math.floor(weeksUntilSafety * 7));
      } else if (committed > onHand + planned) {
        produceBy = asOf;
      }

      let status: PlanStatus = "ok";
      if (batches > 0 && produceBy) {
        const daysLeft = diffDays(produceBy, asOf);
        status = daysLeft <= 7 ? "urgent" : daysLeft <= 14 ? "soon" : "ok";
      }

      return {
        productId: p.id,
        productName: p.name,
        weeklyDemand: weekly,
        horizonDemand,
        committedUnits: committed,
        safetyStock: safety,
        onHand,
        plannedProduction: planned,
        shortfall: Math.max(shortfall, 0),
        suggestedQuantity: batches * batch,
        batches,
        weeksOfCover,
        produceBy: batches > 0 ? produceBy ?? addDays(asOf, horizonWeeks * 7) : null,
        status,
      };
    })
    .sort((a, b) => {
      const rank = { urgent: 0, soon: 1, ok: 2 };
      return rank[a.status] - rank[b.status] || b.suggestedQuantity - a.suggestedQuantity;
    });
}

// ---------------------------------------------------------------------------
// Materials
// ---------------------------------------------------------------------------
export type PurchaseStatus = "ok" | "order_soon" | "late";

export interface MaterialNeed {
  materialId: string;
  materialName: string;
  unit: string;
  required: number;
  onHand: number;
  reorderPoint: number;
  suggestedPurchase: number;
  unitCost: number;
  estimatedCost: number;
  leadTimeDays: number;
  needBy: ISODate | null;
  orderBy: ISODate | null;
  status: PurchaseStatus;
  supplierId: string | null;
}

export function planMaterials(params: {
  asOf: ISODate;
  products: Product[];
  materials: Material[];
  productionNeeds: ProductionNeed[];
  plannedOrders: PlannedOrderInput[];
  supplierLeadTime: Map<string, number>;
  defaultLeadTimeDays: number;
}): MaterialNeed[] {
  const productById = new Map(params.products.map((p) => [p.id, p]));
  const required = new Map<string, number>();
  const needBy = new Map<string, ISODate>();

  const addNeed = (materialId: string, quantity: number, date: ISODate) => {
    required.set(materialId, (required.get(materialId) ?? 0) + quantity);
    const current = needBy.get(materialId);
    if (!current || dayNumber(date) < dayNumber(current)) needBy.set(materialId, date);
  };

  for (const order of params.plannedOrders) {
    const product = productById.get(order.productId);
    if (!product) continue;
    for (const c of standardConsumption(product.recipe, product.batchSize, order.quantity)) {
      addNeed(c.materialId, c.quantity, dayNumber(order.plannedDate) < dayNumber(params.asOf) ? params.asOf : order.plannedDate);
    }
  }
  for (const need of params.productionNeeds) {
    if (need.suggestedQuantity <= 0) continue;
    const product = productById.get(need.productId);
    if (!product) continue;
    for (const c of standardConsumption(product.recipe, product.batchSize, need.suggestedQuantity)) {
      addNeed(c.materialId, c.quantity, need.produceBy ?? params.asOf);
    }
  }

  return params.materials
    .filter((m) => required.has(m.id) || m.currentStock <= m.reorderPoint)
    .map((m) => {
      const req = required.get(m.id) ?? 0;
      const onHand = Math.max(m.currentStock, 0);
      const suggested = Math.max(req + m.reorderPoint - onHand, 0);
      const lead = m.leadTimeDays ?? (m.supplierId ? params.supplierLeadTime.get(m.supplierId) : undefined) ?? params.defaultLeadTimeDays;
      const neededBy = needBy.get(m.id) ?? (suggested > 0 ? params.asOf : null);
      const orderBy = neededBy ? addDays(neededBy, -lead) : null;

      let status: PurchaseStatus = "ok";
      if (suggested > 0 && orderBy) {
        const days = diffDays(orderBy, params.asOf);
        status = days < 0 ? "late" : days <= 7 ? "order_soon" : "ok";
      }

      return {
        materialId: m.id,
        materialName: m.name,
        unit: m.unit,
        required: req,
        onHand,
        reorderPoint: m.reorderPoint,
        suggestedPurchase: suggested,
        unitCost: m.costPerUnit,
        estimatedCost: suggested * m.costPerUnit,
        leadTimeDays: lead,
        needBy: suggested > 0 ? neededBy : null,
        orderBy: suggested > 0 ? orderBy : null,
        status,
        supplierId: m.supplierId,
      };
    })
    .filter((n) => n.suggestedPurchase > 0 || n.required > 0)
    .sort((a, b) => {
      const rank = { late: 0, order_soon: 1, ok: 2 };
      return rank[a.status] - rank[b.status] || b.estimatedCost - a.estimatedCost;
    });
}

// ---------------------------------------------------------------------------
// Cash
// ---------------------------------------------------------------------------
export interface CashMovement {
  direction: "in" | "out";
  date: ISODate;
  amount: number;
  voided: boolean;
}

/** Cash on hand today = opening balance + payments in - payments out - expenses since the opening date. */
export function cashPosition(params: {
  openingBalance: number;
  openingDate: ISODate | null;
  payments: CashMovement[];
  expenses: Expense[];
  asOf: ISODate;
}): number | null {
  if (!params.openingDate) return null;
  const from = dayNumber(params.openingDate);
  const to = dayNumber(params.asOf);
  let balance = params.openingBalance;
  for (const p of params.payments) {
    const d = dayNumber(p.date);
    if (p.voided || d < from || d > to) continue;
    balance += p.direction === "in" ? p.amount : -p.amount;
  }
  for (const e of params.expenses) {
    const d = dayNumber(e.date);
    if (d < from || d > to) continue;
    balance -= e.amount;
  }
  return balance;
}

export interface RecurringExpenseInput {
  label: string;
  amount: number;
  dayOfMonth: number;
}

/** Recurring expenses: the latest occurrence of each recurring category, repeated monthly. */
export function recurringExpenseTemplates(expenses: Expense[], asOf: ISODate): RecurringExpenseInput[] {
  const latest = new Map<string, Expense>();
  for (const e of expenses) {
    if (!e.isRecurring || dayNumber(e.date) > dayNumber(asOf)) continue;
    const key = e.category.trim().toLowerCase();
    const current = latest.get(key);
    if (!current || dayNumber(e.date) > dayNumber(current.date)) latest.set(key, e);
  }
  return [...latest.values()]
    .filter((e) => diffDays(asOf, e.date) <= 62)
    .map((e) => ({ label: e.category, amount: e.amount, dayOfMonth: Number(e.date.slice(8, 10)) }));
}

export function weeklyVariableExpenses(expenses: Expense[], asOf: ISODate, lookbackDays = 90): number {
  const from = dayNumber(addDays(asOf, -lookbackDays + 1));
  const total = expenses
    .filter((e) => !e.isRecurring && dayNumber(e.date) >= from && dayNumber(e.date) <= dayNumber(asOf))
    .reduce((s, e) => s + e.amount, 0);
  return total / (lookbackDays / 7);
}

export function weeklySalesByChannel(
  sales: SaleLine[],
  channels: Channel[],
  asOf: ISODate,
  lookbackWeeks: number
): { channelId: string; weeklyRevenue: number; collectionDays: number }[] {
  const from = dayNumber(addDays(asOf, -lookbackWeeks * 7 + 1));
  const revenue = new Map<string, number>();
  for (const s of sales) {
    const d = dayNumber(s.issueDate);
    if (d < from || d > dayNumber(asOf)) continue;
    revenue.set(s.channelId, (revenue.get(s.channelId) ?? 0) + s.revenue);
  }
  return channels
    .filter((c) => revenue.has(c.id))
    .map((c) => ({ channelId: c.id, weeklyRevenue: (revenue.get(c.id) ?? 0) / lookbackWeeks, collectionDays: c.paymentTermsDays }));
}

export interface PlannedPurchaseInput {
  date: ISODate;
  amount: number;
  paymentTermsDays: number;
}

export interface CashWeek {
  weekStart: ISODate;
  weekEnd: ISODate;
  opening: number;
  receivables: number;
  forecastSales: number;
  payables: number;
  plannedPurchases: number;
  expenses: number;
  inflows: number;
  outflows: number;
  closing: number;
}

export interface CashProjection {
  weeks: CashWeek[];
  openingCash: number;
  overdueReceivables: number;
  overduePayables: number;
  minBalance: number;
  minBalanceWeek: ISODate | null;
  firstNegativeWeek: ISODate | null;
  endingBalance: number;
}

export function projectCash(params: {
  asOf: ISODate;
  weeks: number;
  openingCash: number;
  receivables: OpenDocument[];
  payables: OpenDocument[];
  salesByChannel: { channelId: string; weeklyRevenue: number; collectionDays: number }[];
  plannedPurchases: PlannedPurchaseInput[];
  recurringExpenses: RecurringExpenseInput[];
  weeklyVariableExpenses: number;
}): CashProjection {
  // Week i covers days [asOf + 1 + 7i, asOf + 7 + 7i]; anything due today or earlier lands in week 0.
  const start = dayNumber(params.asOf);
  const weekIndex = (date: ISODate) => {
    const idx = Math.floor((dayNumber(date) - start - 1) / 7);
    return idx < 0 ? 0 : idx;
  };

  const buckets = Array.from({ length: params.weeks }, () => ({
    receivables: 0,
    forecastSales: 0,
    payables: 0,
    plannedPurchases: 0,
    expenses: 0,
  }));
  const add = (date: ISODate, field: keyof (typeof buckets)[number], amount: number) => {
    const idx = weekIndex(date);
    if (idx < params.weeks) buckets[idx][field] += amount;
  };

  let overdueReceivables = 0;
  for (const r of params.receivables) {
    if (r.balance <= 0) continue;
    if (dayNumber(r.dueDate) < start) overdueReceivables += r.balance;
    add(r.dueDate, "receivables", r.balance);
  }
  let overduePayables = 0;
  for (const p of params.payables) {
    if (p.balance <= 0) continue;
    if (dayNumber(p.dueDate) < start) overduePayables += p.balance;
    add(p.dueDate, "payables", p.balance);
  }

  // Future sales: each day's expected revenue is collected after the channel's terms
  for (const channel of params.salesByChannel) {
    const daily = channel.weeklyRevenue / 7;
    for (let day = 1; day <= params.weeks * 7; day++) {
      add(addDays(params.asOf, day + channel.collectionDays), "forecastSales", daily);
    }
  }

  for (const purchase of params.plannedPurchases) {
    add(addDays(purchase.date, purchase.paymentTermsDays), "plannedPurchases", purchase.amount);
  }

  // Recurring expenses on their day of the month, variable expenses spread weekly
  const horizonEnd = addDays(params.asOf, params.weeks * 7);
  for (const r of params.recurringExpenses) {
    let month = startOfMonth(params.asOf);
    while (dayNumber(month) <= dayNumber(horizonEnd)) {
      const day = Math.min(r.dayOfMonth, Number(endOfMonth(month).slice(8, 10)));
      const date = `${month.slice(0, 8)}${String(day).padStart(2, "0")}`;
      if (dayNumber(date) > start && dayNumber(date) <= dayNumber(horizonEnd)) add(date, "expenses", r.amount);
      month = addMonths(month, 1);
    }
  }
  for (let w = 0; w < params.weeks; w++) buckets[w].expenses += params.weeklyVariableExpenses;

  let balance = params.openingCash;
  let minBalance = balance;
  let minBalanceWeek: ISODate | null = null;
  let firstNegativeWeek: ISODate | null = null;

  const weeks: CashWeek[] = buckets.map((b, i) => {
    const weekStart = addDays(params.asOf, 1 + i * 7);
    const inflows = b.receivables + b.forecastSales;
    const outflows = b.payables + b.plannedPurchases + b.expenses;
    const opening = balance;
    balance = opening + inflows - outflows;
    if (balance < minBalance) {
      minBalance = balance;
      minBalanceWeek = weekStart;
    }
    if (balance < 0 && !firstNegativeWeek) firstNegativeWeek = weekStart;
    return { weekStart, weekEnd: addDays(weekStart, 6), opening, ...b, inflows, outflows, closing: balance };
  });

  return {
    weeks,
    openingCash: params.openingCash,
    overdueReceivables,
    overduePayables,
    minBalance,
    minBalanceWeek,
    firstNegativeWeek,
    endingBalance: balance,
  };
}
