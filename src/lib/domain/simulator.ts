// Opportunity 4: "what if" simulator over the business model. Builds a monthly baseline from
// recent sales and current costs, then applies levers (prices, volumes, input costs, batch sizes,
// channel shifts, a new distributor, fixed cost changes) and recomputes contribution, operating
// profit and break-even. Deterministic and explainable: no forecasting model involved.
import { computeProductCost, resolveDistributorPrice } from "./costing";
import { addDays, dayNumber, type ISODate } from "./dates";
import type { Channel, CostSettings, Expense, Material, Product, SaleLine } from "./types";

export interface BaselineItem {
  productId: string;
  channelId: string;
  monthlyUnits: number;
  netPrice: number; // average net revenue per unit in this channel
}

export interface SimulatorBaseline {
  asOf: ISODate;
  lookbackDays: number;
  items: BaselineItem[];
  products: Product[];
  materials: Material[];
  channels: Channel[];
  settings: CostSettings;
  unitsPerOrder: Record<string, number>; // channelId -> average units per invoice
  fixedCostsMonthly: number;
}

export interface Scenario {
  globalPricePct: number;
  productPricePct: Record<string, number>;
  channelPricePct: Record<string, number>;
  globalVolumePct: number;
  productVolumePct: Record<string, number>;
  materialCostPct: Record<string, number>;
  laborRatePct: number;
  batchSize: Record<string, number>;
  channelShift: { fromChannelId: string; toChannelId: string; pct: number } | null;
  newDistributor: { channelId: string; discountPct: number; monthlyUnits: Record<string, number> } | null;
  fixedCostMonthlyDelta: number;
}

export const emptyScenario: Scenario = {
  globalPricePct: 0,
  productPricePct: {},
  channelPricePct: {},
  globalVolumePct: 0,
  productVolumePct: {},
  materialCostPct: {},
  laborRatePct: 0,
  batchSize: {},
  channelShift: null,
  newDistributor: null,
  fixedCostMonthlyDelta: 0,
};

export interface OutcomeItem {
  productId: string;
  channelId: string;
  units: number;
  price: number;
  unitVariableCost: number;
  unitChannelCost: number;
  revenue: number;
  contribution: number;
}

export interface SimulationOutcome {
  units: number;
  revenue: number;
  variableCosts: number;
  channelCosts: number;
  contribution: number;
  contributionMargin: number;
  fixedCosts: number;
  operatingProfit: number;
  breakEvenRevenue: number | null; // null when contribution margin <= 0
  items: OutcomeItem[];
  byProduct: { productId: string; units: number; revenue: number; contribution: number; margin: number }[];
}

export interface SimulationResult {
  baseline: SimulationOutcome;
  scenario: SimulationOutcome;
  delta: {
    revenue: number;
    contribution: number;
    operatingProfit: number;
    contributionMarginPts: number;
    breakEvenRevenue: number | null;
  };
}

export function buildBaseline(params: {
  asOf: ISODate;
  lookbackDays?: number;
  sales: SaleLine[];
  products: Product[];
  materials: Material[];
  channels: Channel[];
  expenses: Expense[];
  settings: CostSettings;
}): SimulatorBaseline {
  const lookbackDays = params.lookbackDays ?? 90;
  const from = dayNumber(addDays(params.asOf, -lookbackDays + 1));
  const to = dayNumber(params.asOf);
  const months = lookbackDays / 30;

  const inRange = params.sales.filter((s) => s.productId && dayNumber(s.issueDate) >= from && dayNumber(s.issueDate) <= to);

  const acc = new Map<string, { productId: string; channelId: string; units: number; revenue: number }>();
  const channelUnits = new Map<string, number>();
  const channelInvoices = new Map<string, Set<string>>();
  for (const s of inRange) {
    const key = `${s.productId}|${s.channelId}`;
    const item = acc.get(key) ?? { productId: s.productId as string, channelId: s.channelId, units: 0, revenue: 0 };
    item.units += s.quantity;
    item.revenue += s.revenue;
    acc.set(key, item);
    channelUnits.set(s.channelId, (channelUnits.get(s.channelId) ?? 0) + s.quantity);
    if (!channelInvoices.has(s.channelId)) channelInvoices.set(s.channelId, new Set());
    channelInvoices.get(s.channelId)!.add(s.invoiceId);
  }

  const unitsPerOrder: Record<string, number> = {};
  for (const [channelId, units] of channelUnits) {
    const orders = channelInvoices.get(channelId)?.size ?? 1;
    unitsPerOrder[channelId] = orders > 0 ? units / orders : units;
  }

  const expensesInRange = params.expenses.filter((e) => dayNumber(e.date) >= from && dayNumber(e.date) <= to);

  return {
    asOf: params.asOf,
    lookbackDays,
    items: [...acc.values()].map((i) => ({
      productId: i.productId,
      channelId: i.channelId,
      monthlyUnits: i.units / months,
      netPrice: i.units > 0 ? i.revenue / i.units : 0,
    })),
    products: params.products,
    materials: params.materials,
    channels: params.channels,
    settings: params.settings,
    unitsPerOrder,
    fixedCostsMonthly: expensesInRange.reduce((s, e) => s + e.amount, 0) / months,
  };
}

function channelUnitCost(channel: Channel | undefined, price: number, unitsPerOrder: number): number {
  if (!channel) return 0;
  const perOrder = unitsPerOrder > 0 ? channel.costPerOrder / unitsPerOrder : channel.costPerOrder;
  return price * (channel.commissionPct + channel.paymentFeePct) + channel.costPerUnit + perOrder;
}

function listPriceFor(product: Product, channel: Channel | undefined, settings: CostSettings): number {
  if (channel?.priceBasis === "distributor") {
    return resolveDistributorPrice(product.retailPrice, product.distributorPrice, null, settings.distributorMargin);
  }
  return product.retailPrice;
}

export function runScenario(baseline: SimulatorBaseline, scenario: Scenario): SimulationOutcome {
  const productById = new Map(baseline.products.map((p) => [p.id, p]));
  const channelById = new Map(baseline.channels.map((c) => [c.id, c]));
  const materialCost = new Map(
    baseline.materials.map((m) => [m.id, m.costPerUnit * (1 + (scenario.materialCostPct[m.id] ?? 0))])
  );
  const settings: CostSettings = {
    ...baseline.settings,
    laborCostPerHour: baseline.settings.laborCostPerHour * (1 + scenario.laborRatePct),
  };

  const unitCost = new Map<string, number>();
  const variableCostOf = (productId: string) => {
    if (!unitCost.has(productId)) {
      const product = productById.get(productId);
      if (!product) return 0;
      const cost = computeProductCost(
        {
          ...product,
          batchSize: scenario.batchSize[productId] ?? product.batchSize,
          laborCostPerPiece: product.laborCostPerPiece * (1 + scenario.laborRatePct),
        },
        (id) => materialCost.get(id) ?? 0,
        settings
      );
      unitCost.set(productId, cost.variable);
    }
    return unitCost.get(productId)!;
  };

  // 1. Volumes and prices per (product, channel)
  const rows = new Map<string, { productId: string; channelId: string; units: number; price: number }>();
  for (const item of baseline.items) {
    const volumeFactor = (1 + scenario.globalVolumePct) * (1 + (scenario.productVolumePct[item.productId] ?? 0));
    const priceFactor =
      (1 + scenario.globalPricePct) *
      (1 + (scenario.productPricePct[item.productId] ?? 0)) *
      (1 + (scenario.channelPricePct[item.channelId] ?? 0));
    rows.set(`${item.productId}|${item.channelId}`, {
      productId: item.productId,
      channelId: item.channelId,
      units: item.monthlyUnits * volumeFactor,
      price: item.netPrice * priceFactor,
    });
  }

  // 2. Channel shift: move a share of units from one channel to another
  const shift = scenario.channelShift;
  if (shift && shift.pct > 0 && shift.fromChannelId && shift.toChannelId && shift.fromChannelId !== shift.toChannelId) {
    const { fromChannelId, toChannelId, pct } = shift;
    const toChannel = channelById.get(toChannelId);
    for (const row of [...rows.values()]) {
      if (row.channelId !== fromChannelId || row.units <= 0) continue;
      const moved = row.units * Math.min(pct, 1);
      row.units -= moved;
      const key = `${row.productId}|${toChannelId}`;
      const target = rows.get(key);
      if (target) {
        target.units += moved;
      } else {
        const product = productById.get(row.productId);
        const basePrice = product ? listPriceFor(product, toChannel, baseline.settings) : row.price;
        const priceFactor = (1 + scenario.globalPricePct) * (1 + (scenario.productPricePct[row.productId] ?? 0)) * (1 + (scenario.channelPricePct[toChannelId] ?? 0));
        rows.set(key, { productId: row.productId, channelId: toChannelId, units: moved, price: basePrice * priceFactor });
      }
    }
  }

  // 3. New distributor volume at its discount
  const extraItems: { productId: string; channelId: string; units: number; price: number }[] = [];
  if (scenario.newDistributor) {
    const { channelId, discountPct, monthlyUnits } = scenario.newDistributor;
    for (const [productId, units] of Object.entries(monthlyUnits)) {
      const product = productById.get(productId);
      if (!product || !(units > 0)) continue;
      const priceFactor = (1 + scenario.globalPricePct) * (1 + (scenario.productPricePct[productId] ?? 0));
      extraItems.push({ productId, channelId, units, price: product.retailPrice * priceFactor * (1 - discountPct) });
    }
  }

  const items: OutcomeItem[] = [...rows.values(), ...extraItems]
    .filter((r) => r.units > 0)
    .map((r) => {
      const unitVariableCost = variableCostOf(r.productId);
      const unitChannelCost = channelUnitCost(channelById.get(r.channelId), r.price, baseline.unitsPerOrder[r.channelId] ?? 1);
      const revenue = r.units * r.price;
      return {
        productId: r.productId,
        channelId: r.channelId,
        units: r.units,
        price: r.price,
        unitVariableCost,
        unitChannelCost,
        revenue,
        contribution: revenue - r.units * (unitVariableCost + unitChannelCost),
      };
    });

  const revenue = items.reduce((s, i) => s + i.revenue, 0);
  const variableCosts = items.reduce((s, i) => s + i.units * i.unitVariableCost, 0);
  const channelCosts = items.reduce((s, i) => s + i.units * i.unitChannelCost, 0);
  const contribution = revenue - variableCosts - channelCosts;
  const contributionMargin = revenue > 0 ? contribution / revenue : 0;
  const fixedCosts = Math.max(baseline.fixedCostsMonthly + scenario.fixedCostMonthlyDelta, 0);

  const productTotals = new Map<string, { productId: string; units: number; revenue: number; contribution: number }>();
  for (const i of items) {
    const t = productTotals.get(i.productId) ?? { productId: i.productId, units: 0, revenue: 0, contribution: 0 };
    t.units += i.units;
    t.revenue += i.revenue;
    t.contribution += i.contribution;
    productTotals.set(i.productId, t);
  }

  return {
    units: items.reduce((s, i) => s + i.units, 0),
    revenue,
    variableCosts,
    channelCosts,
    contribution,
    contributionMargin,
    fixedCosts,
    operatingProfit: contribution - fixedCosts,
    breakEvenRevenue: contributionMargin > 0 ? fixedCosts / contributionMargin : null,
    items,
    byProduct: [...productTotals.values()]
      .map((p) => ({ ...p, margin: p.revenue > 0 ? p.contribution / p.revenue : 0 }))
      .sort((a, b) => b.contribution - a.contribution),
  };
}

export function simulate(baseline: SimulatorBaseline, scenario: Scenario): SimulationResult {
  const base = runScenario(baseline, emptyScenario);
  const next = runScenario(baseline, scenario);
  return {
    baseline: base,
    scenario: next,
    delta: {
      revenue: next.revenue - base.revenue,
      contribution: next.contribution - base.contribution,
      operatingProfit: next.operatingProfit - base.operatingProfit,
      contributionMarginPts: (next.contributionMargin - base.contributionMargin) * 100,
      breakEvenRevenue:
        next.breakEvenRevenue !== null && base.breakEvenRevenue !== null ? next.breakEvenRevenue - base.breakEvenRevenue : null,
    },
  };
}
