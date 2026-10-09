// Opportunity 7 (without AI): explain why the month's margin moved. The gross profit change is
// decomposed exactly into volume, mix (products and channels), price and cost effects; cost is
// further attributed to materials using the cost history. The engine returns structured
// insights; the UI turns them into sentences with the text templates in src/i18n.
import { costLines } from "./profitability";
import { materialCostAt } from "./costImpact";
import { addDays, dayNumber, diffDays, endOfMonth, minDate, startOfMonth, addMonths, type ISODate } from "./dates";
import type { Channel, Expense, Material, MaterialCostChange, OpenDocument, Product, SaleLine } from "./types";

export interface PeriodSummary {
  from: ISODate;
  to: ISODate;
  units: number;
  invoices: number;
  revenue: number;
  cogs: number;
  grossProfit: number;
  grossMargin: number;
  channelCosts: number;
  contribution: number;
  expenses: number;
  operatingResult: number;
}

export interface DecompositionItem {
  productId: string;
  channelId: string;
  unitsPrev: number;
  unitsCurr: number;
  pricePrev: number;
  priceCurr: number;
  costPrev: number;
  costCurr: number;
  priceEffect: number;
  costEffect: number;
}

export interface MarginDecomposition {
  grossProfitPrev: number;
  grossProfitCurr: number;
  delta: number;
  volume: number;
  mix: number;
  price: number;
  cost: number; // in gross-profit terms: negative when costs rose
  items: DecompositionItem[];
}

export interface MaterialCostDriver {
  materialId: string;
  materialName: string;
  costPrev: number;
  costCurr: number;
  changePct: number;
  impact: number; // gross-profit terms (negative = costs went up)
}

function summarize(lines: SaleLine[], channels: Channel[], expenses: Expense[], from: ISODate, to: ISODate): PeriodSummary {
  const inRange = lines.filter((l) => dayNumber(l.issueDate) >= dayNumber(from) && dayNumber(l.issueDate) <= dayNumber(to));
  const costed = costLines(inRange, channels);
  const revenue = costed.reduce((s, l) => s + l.revenue, 0);
  const cogs = costed.reduce((s, l) => s + l.cogs, 0);
  const channelCosts = costed.reduce((s, l) => s + l.channelCost, 0);
  const exp = expenses
    .filter((e) => dayNumber(e.date) >= dayNumber(from) && dayNumber(e.date) <= dayNumber(to))
    .reduce((s, e) => s + e.amount, 0);
  return {
    from,
    to,
    units: costed.reduce((s, l) => s + l.quantity, 0),
    invoices: new Set(costed.map((l) => l.invoiceId)).size,
    revenue,
    cogs,
    grossProfit: revenue - cogs,
    grossMargin: revenue > 0 ? (revenue - cogs) / revenue : 0,
    channelCosts,
    contribution: revenue - cogs - channelCosts,
    expenses: exp,
    operatingResult: revenue - cogs - channelCosts - exp,
  };
}

/**
 * Exact decomposition: volume + mix + price + cost = GP(curr) - GP(prev).
 *   volume = (Q1 - Q0) x average unit margin of the previous period
 *   mix    = sum(q1 x m0) - Q1 x average unit margin of the previous period
 *   price  = sum(q1 x (p1 - p0))
 *   cost   = -sum(q1 x (c1 - c0))
 * Items that did not sell in the previous period use their current price/cost as reference.
 */
export function decomposeGrossProfit(prev: SaleLine[], curr: SaleLine[]): MarginDecomposition {
  type Acc = { productId: string; channelId: string; units: number; revenue: number; cogs: number };
  const group = (lines: SaleLine[]) => {
    const map = new Map<string, Acc>();
    for (const l of lines) {
      const productId = l.productId ?? `custom:${l.productLabel}`;
      const key = `${productId}|${l.channelId}`;
      const a = map.get(key) ?? { productId, channelId: l.channelId, units: 0, revenue: 0, cogs: 0 };
      a.units += l.quantity;
      a.revenue += l.revenue;
      a.cogs += l.cogs;
      map.set(key, a);
    }
    return map;
  };

  const a = group(prev);
  const b = group(curr);
  const q0 = [...a.values()].reduce((s, x) => s + x.units, 0);
  const q1 = [...b.values()].reduce((s, x) => s + x.units, 0);
  const gp0 = [...a.values()].reduce((s, x) => s + x.revenue - x.cogs, 0);
  const gp1 = [...b.values()].reduce((s, x) => s + x.revenue - x.cogs, 0);
  const avgMargin0 = q0 > 0 ? gp0 / q0 : 0;

  let sumQ1M0 = 0;
  let price = 0;
  let cost = 0;
  const items: DecompositionItem[] = [];
  for (const key of new Set([...a.keys(), ...b.keys()])) {
    const x0 = a.get(key);
    const x1 = b.get(key);
    const units1 = x1?.units ?? 0;
    const p1 = x1 && x1.units > 0 ? x1.revenue / x1.units : 0;
    const c1 = x1 && x1.units > 0 ? x1.cogs / x1.units : 0;
    const p0 = x0 && x0.units > 0 ? x0.revenue / x0.units : p1;
    const c0 = x0 && x0.units > 0 ? x0.cogs / x0.units : c1;

    sumQ1M0 += units1 * (p0 - c0);
    const priceEffect = units1 * (p1 - p0);
    const costEffect = -units1 * (c1 - c0);
    price += priceEffect;
    cost += costEffect;

    items.push({
      productId: (x1 ?? x0)!.productId,
      channelId: (x1 ?? x0)!.channelId,
      unitsPrev: x0?.units ?? 0,
      unitsCurr: units1,
      pricePrev: p0,
      priceCurr: p1,
      costPrev: c0,
      costCurr: c1,
      priceEffect,
      costEffect,
    });
  }

  const volume = (q1 - q0) * avgMargin0;
  const mix = sumQ1M0 - q1 * avgMargin0;

  return { grossProfitPrev: gp0, grossProfitCurr: gp1, delta: gp1 - gp0, volume, mix, price, cost, items };
}

/** Attributes the unit-cost change of products sold this period to the materials in their recipes. */
export function attributeCostToMaterials(params: {
  decomposition: MarginDecomposition;
  products: Product[];
  materials: Material[];
  costHistory: MaterialCostChange[];
  prevEnd: ISODate;
  currEnd: ISODate;
}): MaterialCostDriver[] {
  const productById = new Map(params.products.map((p) => [p.id, p]));
  const unitsByProduct = new Map<string, number>();
  for (const item of params.decomposition.items) {
    unitsByProduct.set(item.productId, (unitsByProduct.get(item.productId) ?? 0) + item.unitsCurr);
  }

  const drivers = new Map<string, MaterialCostDriver>();
  for (const material of params.materials) {
    const costPrev = materialCostAt(params.costHistory, material.id, `${params.prevEnd}T23:59:59`, material.costPerUnit);
    const costCurr = materialCostAt(params.costHistory, material.id, `${params.currEnd}T23:59:59`, material.costPerUnit);
    if (costPrev === costCurr) continue;

    let impact = 0;
    for (const [productId, units] of unitsByProduct) {
      const product = productById.get(productId);
      if (!product || !(product.batchSize > 0) || units <= 0) continue;
      const perUnit = product.recipe.filter((r) => r.materialId === material.id).reduce((s, r) => s + r.quantity, 0) / product.batchSize;
      impact -= units * perUnit * (costCurr - costPrev);
    }
    if (impact !== 0) {
      drivers.set(material.id, {
        materialId: material.id,
        materialName: material.name,
        costPrev,
        costCurr,
        changePct: costPrev > 0 ? (costCurr - costPrev) / costPrev : 0,
        impact,
      });
    }
  }
  return [...drivers.values()].sort((x, y) => Math.abs(y.impact) - Math.abs(x.impact));
}

export type Tone = "positive" | "negative" | "neutral";

export type Insight =
  | { kind: "no_data"; tone: Tone }
  | { kind: "headline"; tone: Tone; contribution: number; delta: number; deltaPct: number | null }
  | { kind: "gross_margin"; tone: Tone; marginPrev: number; marginCurr: number; pts: number }
  | { kind: "volume"; tone: Tone; amount: number; unitsPct: number | null }
  | { kind: "mix"; tone: Tone; amount: number; channelLabel: string | null; channelSharePts: number | null }
  | { kind: "price"; tone: Tone; amount: number; productLabel: string | null }
  | { kind: "cost"; tone: Tone; amount: number; materialName: string | null; materialChangePct: number | null }
  | { kind: "expenses"; tone: Tone; amount: number; deltaPct: number | null; categoryLabel: string | null; categoryDelta: number }
  | { kind: "operating"; tone: Tone; amount: number }
  | { kind: "top_product"; tone: Tone; productLabel: string; contribution: number; share: number }
  | { kind: "loss_maker"; tone: Tone; productLabel: string; channelLabel: string; contribution: number }
  | { kind: "receivables"; tone: Tone; amount: number; overdue: number };

export interface MonthlyReport {
  current: PeriodSummary;
  previous: PeriodSummary;
  decomposition: MarginDecomposition;
  materialDrivers: MaterialCostDriver[];
  insights: Insight[];
}

export function buildMonthlyReport(params: {
  month: ISODate;
  asOf: ISODate;
  sales: SaleLine[];
  expenses: Expense[];
  channels: Channel[];
  products: Product[];
  materials: Material[];
  costHistory: MaterialCostChange[];
  receivables: OpenDocument[];
  labels: { product: (id: string) => string; channel: (id: string) => string };
}): MonthlyReport {
  const currFrom = startOfMonth(params.month);
  const currTo = minDate(endOfMonth(params.month), params.asOf);
  const prevFrom = startOfMonth(addMonths(currFrom, -1));
  // Compare the same number of days when the month is still in progress
  const prevTo = minDate(endOfMonth(prevFrom), addDays(prevFrom, diffDays(currTo, currFrom)));

  const inRange = (from: ISODate, to: ISODate) => (l: SaleLine) =>
    dayNumber(l.issueDate) >= dayNumber(from) && dayNumber(l.issueDate) <= dayNumber(to);
  const currLines = params.sales.filter(inRange(currFrom, currTo));
  const prevLines = params.sales.filter(inRange(prevFrom, prevTo));

  const current = summarize(params.sales, params.channels, params.expenses, currFrom, currTo);
  const previous = summarize(params.sales, params.channels, params.expenses, prevFrom, prevTo);
  const decomposition = decomposeGrossProfit(prevLines, currLines);
  const materialDrivers = attributeCostToMaterials({
    decomposition,
    products: params.products,
    materials: params.materials,
    costHistory: params.costHistory,
    prevEnd: prevTo,
    currEnd: currTo,
  });

  const insights: Insight[] = [];
  const tone = (value: number, epsilon = 0.005): Tone => (value > epsilon ? "positive" : value < -epsilon ? "negative" : "neutral");

  if (currLines.length === 0) {
    insights.push({ kind: "no_data", tone: "neutral" });
    return { current, previous, decomposition, materialDrivers, insights };
  }

  const contributionDelta = current.contribution - previous.contribution;
  insights.push({
    kind: "headline",
    tone: tone(contributionDelta),
    contribution: current.contribution,
    delta: contributionDelta,
    deltaPct: previous.contribution !== 0 ? contributionDelta / Math.abs(previous.contribution) : null,
  });

  if (previous.revenue > 0) {
    insights.push({
      kind: "gross_margin",
      tone: tone(current.grossMargin - previous.grossMargin, 0.0005),
      marginPrev: previous.grossMargin,
      marginCurr: current.grossMargin,
      pts: (current.grossMargin - previous.grossMargin) * 100,
    });
  }

  // Drivers, largest first
  const channelShares = (lines: SaleLine[]) => {
    const total = lines.reduce((s, l) => s + l.quantity, 0);
    const shares = new Map<string, number>();
    for (const l of lines) shares.set(l.channelId, (shares.get(l.channelId) ?? 0) + l.quantity / (total || 1));
    return shares;
  };
  const sharesPrev = channelShares(prevLines);
  const sharesCurr = channelShares(currLines);
  let topShift: { channelId: string; pts: number } | null = null;
  for (const channelId of new Set([...sharesPrev.keys(), ...sharesCurr.keys()])) {
    const pts = ((sharesCurr.get(channelId) ?? 0) - (sharesPrev.get(channelId) ?? 0)) * 100;
    if (!topShift || pts > topShift.pts) topShift = { channelId, pts };
  }

  const topPriceItem = [...decomposition.items].sort((x, y) => Math.abs(y.priceEffect) - Math.abs(x.priceEffect))[0];
  const topMaterial = materialDrivers[0];

  const drivers: Insight[] = [];
  if (previous.units > 0) {
    drivers.push({
      kind: "volume",
      tone: tone(decomposition.volume),
      amount: decomposition.volume,
      unitsPct: (current.units - previous.units) / previous.units,
    });
    drivers.push({
      kind: "mix",
      tone: tone(decomposition.mix),
      amount: decomposition.mix,
      channelLabel: topShift && topShift.pts >= 1 ? params.labels.channel(topShift.channelId) : null,
      channelSharePts: topShift && topShift.pts >= 1 ? topShift.pts : null,
    });
    drivers.push({
      kind: "price",
      tone: tone(decomposition.price),
      amount: decomposition.price,
      productLabel: topPriceItem && Math.abs(topPriceItem.priceEffect) > 0.005 ? params.labels.product(topPriceItem.productId) : null,
    });
    drivers.push({
      kind: "cost",
      tone: tone(decomposition.cost),
      amount: decomposition.cost,
      materialName: topMaterial ? topMaterial.materialName : null,
      materialChangePct: topMaterial ? topMaterial.changePct : null,
    });
  }
  insights.push(...drivers.filter((d) => "amount" in d && Math.abs(d.amount) >= 0.5).sort((x, y) => Math.abs((y as { amount: number }).amount) - Math.abs((x as { amount: number }).amount)));

  // Expenses
  const byCategory = (from: ISODate, to: ISODate) => {
    const map = new Map<string, number>();
    for (const e of params.expenses) {
      if (dayNumber(e.date) < dayNumber(from) || dayNumber(e.date) > dayNumber(to)) continue;
      map.set(e.category, (map.get(e.category) ?? 0) + e.amount);
    }
    return map;
  };
  const catPrev = byCategory(prevFrom, prevTo);
  const catCurr = byCategory(currFrom, currTo);
  let topCategory: { label: string; delta: number } | null = null;
  for (const cat of new Set([...catPrev.keys(), ...catCurr.keys()])) {
    const delta = (catCurr.get(cat) ?? 0) - (catPrev.get(cat) ?? 0);
    if (!topCategory || delta > topCategory.delta) topCategory = { label: cat, delta };
  }
  if (current.expenses > 0 || previous.expenses > 0) {
    const delta = current.expenses - previous.expenses;
    insights.push({
      kind: "expenses",
      tone: tone(-delta),
      amount: current.expenses,
      deltaPct: previous.expenses > 0 ? delta / previous.expenses : null,
      categoryLabel: topCategory && topCategory.delta > 0 ? topCategory.label : null,
      categoryDelta: topCategory?.delta ?? 0,
    });
  }

  insights.push({ kind: "operating", tone: tone(current.operatingResult), amount: current.operatingResult });

  // Best product and loss makers (product x channel)
  const costed = costLines(currLines, params.channels);
  const byProduct = new Map<string, number>();
  const byCell = new Map<string, { productId: string; channelId: string; contribution: number }>();
  for (const l of costed) {
    const pid = l.productId ?? `custom:${l.productLabel}`;
    byProduct.set(pid, (byProduct.get(pid) ?? 0) + l.contribution);
    const key = `${pid}|${l.channelId}`;
    const cell = byCell.get(key) ?? { productId: pid, channelId: l.channelId, contribution: 0 };
    cell.contribution += l.contribution;
    byCell.set(key, cell);
  }
  const best = [...byProduct.entries()].sort((x, y) => y[1] - x[1])[0];
  if (best && best[1] > 0) {
    insights.push({
      kind: "top_product",
      tone: "positive",
      productLabel: params.labels.product(best[0]),
      contribution: best[1],
      share: current.contribution > 0 ? best[1] / current.contribution : 0,
    });
  }
  for (const cell of [...byCell.values()].filter((c) => c.contribution < 0).sort((x, y) => x.contribution - y.contribution).slice(0, 3)) {
    insights.push({
      kind: "loss_maker",
      tone: "negative",
      productLabel: params.labels.product(cell.productId),
      channelLabel: params.labels.channel(cell.channelId),
      contribution: cell.contribution,
    });
  }

  const receivable = params.receivables.reduce((s, r) => s + r.balance, 0);
  if (receivable > 0) {
    const overdue = params.receivables
      .filter((r) => dayNumber(r.dueDate) < dayNumber(params.asOf))
      .reduce((s, r) => s + r.balance, 0);
    insights.push({ kind: "receivables", tone: overdue > 0 ? "negative" : "neutral", amount: receivable, overdue });
  }

  return { current, previous, decomposition, materialDrivers, insights };
}
