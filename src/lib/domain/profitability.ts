// Opportunity 1: real profitability by product, channel and customer/distributor.
// Contribution = net revenue - cost of goods sold - channel costs (commissions, payment fees,
// per-order and per-unit costs configured on each channel).
import type { Channel, SaleLine } from "./types";

export type ProfitDimension = "product" | "channel" | "counterparty";

export interface ProfitRow {
  key: string;
  label: string;
  units: number;
  revenue: number;
  cogs: number;
  channelCosts: number;
  contribution: number;
  margin: number; // contribution / revenue
  revenueShare: number; // share of total revenue
  contributionShare: number; // share of total contribution
  invoices: number;
}

export interface ProfitCell {
  productId: string;
  channelId: string;
  units: number;
  revenue: number;
  contribution: number;
  margin: number;
}

export interface ProfitTotals {
  units: number;
  revenue: number;
  cogs: number;
  channelCosts: number;
  contribution: number;
  margin: number;
  invoices: number;
}

export interface ProfitabilityResult {
  totals: ProfitTotals;
  byProduct: ProfitRow[];
  byChannel: ProfitRow[];
  byCounterparty: ProfitRow[];
  matrix: ProfitCell[];
  lossMakers: ProfitRow[]; // rows with negative contribution across all dimensions
}

export interface CostedLine extends SaleLine {
  channelCost: number;
  contribution: number;
}

/** Allocates each channel's costs to the lines of its invoices. */
export function costLines(lines: SaleLine[], channels: Channel[]): CostedLine[] {
  const channelById = new Map(channels.map((c) => [c.id, c]));
  const invoiceRevenue = new Map<string, number>();
  const invoiceLineCount = new Map<string, number>();
  for (const line of lines) {
    invoiceRevenue.set(line.invoiceId, (invoiceRevenue.get(line.invoiceId) ?? 0) + line.revenue);
    invoiceLineCount.set(line.invoiceId, (invoiceLineCount.get(line.invoiceId) ?? 0) + 1);
  }

  return lines.map((line) => {
    const channel = channelById.get(line.channelId);
    let channelCost = 0;
    if (channel) {
      const invoiceTotal = invoiceRevenue.get(line.invoiceId) ?? 0;
      const orderShare = invoiceTotal > 0 ? line.revenue / invoiceTotal : 1 / (invoiceLineCount.get(line.invoiceId) ?? 1);
      channelCost =
        line.revenue * (channel.commissionPct + channel.paymentFeePct) +
        line.quantity * channel.costPerUnit +
        channel.costPerOrder * orderShare;
    }
    return { ...line, channelCost, contribution: line.revenue - line.cogs - channelCost };
  });
}

function emptyRow(key: string, label: string): ProfitRow {
  return {
    key,
    label,
    units: 0,
    revenue: 0,
    cogs: 0,
    channelCosts: 0,
    contribution: 0,
    margin: 0,
    revenueShare: 0,
    contributionShare: 0,
    invoices: 0,
  };
}

function aggregate(
  lines: CostedLine[],
  keyOf: (l: CostedLine) => string,
  labelOf: (l: CostedLine) => string,
  totals: ProfitTotals
): ProfitRow[] {
  const rows = new Map<string, ProfitRow>();
  const invoicesPerRow = new Map<string, Set<string>>();

  for (const line of lines) {
    const key = keyOf(line);
    let row = rows.get(key);
    if (!row) {
      row = emptyRow(key, labelOf(line));
      rows.set(key, row);
      invoicesPerRow.set(key, new Set());
    }
    row.units += line.quantity;
    row.revenue += line.revenue;
    row.cogs += line.cogs;
    row.channelCosts += line.channelCost;
    row.contribution += line.contribution;
    invoicesPerRow.get(key)!.add(line.invoiceId);
  }

  return [...rows.values()]
    .map((row) => ({
      ...row,
      margin: row.revenue > 0 ? row.contribution / row.revenue : 0,
      revenueShare: totals.revenue > 0 ? row.revenue / totals.revenue : 0,
      contributionShare: totals.contribution !== 0 ? row.contribution / totals.contribution : 0,
      invoices: invoicesPerRow.get(row.key)!.size,
    }))
    .sort((a, b) => b.contribution - a.contribution);
}

export function analyzeProfitability(
  lines: SaleLine[],
  channels: Channel[],
  labels: { channel: (id: string) => string }
): ProfitabilityResult {
  const costed = costLines(lines, channels);

  const totals: ProfitTotals = costed.reduce<ProfitTotals>(
    (t, l) => ({
      units: t.units + l.quantity,
      revenue: t.revenue + l.revenue,
      cogs: t.cogs + l.cogs,
      channelCosts: t.channelCosts + l.channelCost,
      contribution: t.contribution + l.contribution,
      margin: 0,
      invoices: 0,
    }),
    { units: 0, revenue: 0, cogs: 0, channelCosts: 0, contribution: 0, margin: 0, invoices: 0 }
  );
  totals.margin = totals.revenue > 0 ? totals.contribution / totals.revenue : 0;
  totals.invoices = new Set(costed.map((l) => l.invoiceId)).size;

  const byProduct = aggregate(costed, (l) => l.productId ?? `custom:${l.productLabel}`, (l) => l.productLabel, totals);
  const byChannel = aggregate(costed, (l) => l.channelId, (l) => labels.channel(l.channelId), totals);
  const byCounterparty = aggregate(costed, (l) => l.counterpartyKey, (l) => l.counterpartyLabel, totals);

  const cells = new Map<string, ProfitCell>();
  for (const l of costed) {
    if (!l.productId) continue;
    const key = `${l.productId}|${l.channelId}`;
    const cell = cells.get(key) ?? { productId: l.productId, channelId: l.channelId, units: 0, revenue: 0, contribution: 0, margin: 0 };
    cell.units += l.quantity;
    cell.revenue += l.revenue;
    cell.contribution += l.contribution;
    cells.set(key, cell);
  }
  const matrix = [...cells.values()].map((c) => ({ ...c, margin: c.revenue > 0 ? c.contribution / c.revenue : 0 }));

  const lossMakers = [...byProduct, ...byChannel, ...byCounterparty].filter((r) => r.contribution < 0);

  return { totals, byProduct, byChannel, byCounterparty, matrix, lossMakers };
}
