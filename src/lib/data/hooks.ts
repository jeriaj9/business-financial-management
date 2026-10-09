'use client';

import useSWR, { mutate as globalMutate } from 'swr';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/components/auth/AuthProvider';
import {
  mapChannel,
  mapCostChange,
  mapDistributor,
  mapExpense,
  mapMaterial,
  mapPriceChange,
  mapProduct,
  mapSaleLine,
  mapSettings,
  type Row,
} from './mappers';
import type { SaleLine } from '@/lib/domain/types';

const PAGE = 1000;

/** Reads every page of a PostgREST query (the API caps each response at 1000 rows). */
export async function fetchAll<T = Row>(
  build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const page = (data as T[] | null) ?? [];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows;
}

async function single<T = Row>(query: PromiseLike<{ data: T | null; error: unknown }>): Promise<T | null> {
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

/** Revalidates every cached query of the company whose key starts with one of the given names. */
export function invalidate(...names: string[]) {
  return globalMutate((key) => Array.isArray(key) && names.includes(key[0] as string));
}

// ---------------------------------------------------------------------------
// Company context
// ---------------------------------------------------------------------------
export function useCompany() {
  const { profile } = useAuth();
  const companyId = profile?.company_id ?? undefined;
  const settings = useSettings(companyId);
  const role = profile?.role ?? 'view';
  return {
    companyId,
    companyName: profile?.companies?.name ?? '',
    role,
    canEdit: role === 'admin' || role === 'edit',
    isAdmin: role === 'admin',
    settings: settings.data ?? null,
    currency: settings.data?.currency ?? 'DOP',
    settingsLoading: settings.isLoading,
  };
}

export function useSettings(companyId?: string) {
  return useSWR(companyId ? ['settings', companyId] : null, async ([, id]) =>
    mapSettings(await single(supabase.from('settings').select('*').eq('company_id', id).maybeSingle()))
  );
}

// ---------------------------------------------------------------------------
// Master data
// ---------------------------------------------------------------------------
export function useMaterials(companyId?: string) {
  return useSWR(companyId ? ['materials', companyId] : null, async ([, id]) =>
    (await fetchAll((f, t) => supabase.from('materials').select('*, suppliers(name)').eq('company_id', id).order('name').range(f, t))).map(mapMaterial)
  );
}

export function useProducts(companyId?: string) {
  return useSWR(companyId ? ['products', companyId] : null, async ([, id]) =>
    (
      await fetchAll((f, t) =>
        supabase.from('products').select('*, bom:bom_items(material_id, quantity)').eq('company_id', id).order('name').range(f, t)
      )
    ).map(mapProduct)
  );
}

export function useChannels(companyId?: string) {
  return useSWR(companyId ? ['sales_channels', companyId] : null, async ([, id]) =>
    (await fetchAll((f, t) => supabase.from('sales_channels').select('*').eq('company_id', id).order('created_at').range(f, t))).map(mapChannel)
  );
}

export function useDistributors(companyId?: string) {
  return useSWR(companyId ? ['distributors', companyId] : null, async ([, id]) =>
    (await fetchAll((f, t) => supabase.from('distributors').select('*').eq('company_id', id).order('name').range(f, t))).map(mapDistributor)
  );
}

export function useCustomers(companyId?: string) {
  return useSWR(companyId ? ['customers', companyId] : null, async ([, id]) =>
    fetchAll((f, t) => supabase.from('customers').select('*').eq('company_id', id).order('name').range(f, t))
  );
}

export function useSuppliers(companyId?: string) {
  return useSWR(companyId ? ['suppliers', companyId] : null, async ([, id]) =>
    fetchAll((f, t) => supabase.from('suppliers').select('*').eq('company_id', id).order('name').range(f, t))
  );
}

// ---------------------------------------------------------------------------
// Transactions
// ---------------------------------------------------------------------------
const SALE_LINE_SELECT =
  'id, product_id, description, quantity, list_price, unit_price, discount_pct, line_total, unit_cost, cogs, ' +
  'invoice:invoices!inner(id, number, issue_date, due_date, channel_id, customer_id, distributor_id, customer_name, status, customers(name), distributors(name))';

/** Raw invoice lines (issued invoices only) between two dates; map with toSaleLines(). */
export function useSalesLineRows(companyId: string | undefined, from: string, to: string) {
  return useSWR(companyId ? ['invoice_lines', companyId, from, to] : null, async ([, id, f0, t0]) =>
    fetchAll((f, t) =>
      supabase
        .from('invoice_lines')
        .select(SALE_LINE_SELECT)
        .eq('company_id', id)
        .eq('invoice.status', 'issued')
        .gte('invoice.issue_date', f0)
        .lte('invoice.issue_date', t0)
        .order('id')
        .range(f, t)
    )
  );
}

export function toSaleLines(rows: Row[] | undefined, products: { id: string; name: string }[] | undefined): SaleLine[] {
  if (!rows) return [];
  const names = new Map((products ?? []).map((p) => [p.id, p.name]));
  return rows.map((r) => mapSaleLine(r, (id) => (id ? names.get(id) ?? 'Producto eliminado' : 'Artículo')));
}

export function useInvoices(companyId: string | undefined, from: string, to: string) {
  return useSWR(companyId ? ['invoices', companyId, from, to] : null, async ([, id, f0, t0]) =>
    fetchAll((f, t) =>
      supabase
        .from('invoices')
        .select('*, invoice_lines(*, products(name, sku)), payments(*), sales_channels(name, kind), customers(name), distributors(name)')
        .eq('company_id', id)
        .gte('issue_date', f0)
        .lte('issue_date', t0)
        .order('issue_date', { ascending: false })
        .order('number', { ascending: false })
        .range(f, t)
    )
  );
}

export function useOpenReceivables(companyId?: string) {
  return useSWR(companyId ? ['receivables', companyId] : null, async ([, id]) =>
    fetchAll((f, t) =>
      supabase
        .from('invoices')
        .select('id, number, issue_date, due_date, total, amount_paid, balance, channel_id, customer_name, customer_id, distributor_id, customers(name), distributors(name)')
        .eq('company_id', id)
        .eq('status', 'issued')
        .gt('balance', 0.009)
        .order('due_date')
        .range(f, t)
    )
  );
}

export function useOpenPayables(companyId?: string) {
  return useSWR(companyId ? ['payables', companyId] : null, async ([, id]) =>
    fetchAll((f, t) =>
      supabase
        .from('purchases')
        .select('id, number, purchase_date, due_date, total, amount_paid, balance, supplier_id, suppliers(name)')
        .eq('company_id', id)
        .eq('status', 'received')
        .gt('balance', 0.009)
        .order('due_date')
        .range(f, t)
    )
  );
}

export function usePurchases(companyId: string | undefined, from: string, to: string) {
  return useSWR(companyId ? ['purchases', companyId, from, to] : null, async ([, id, f0, t0]) =>
    fetchAll((f, t) =>
      supabase
        .from('purchases')
        .select('*, purchase_lines(*, materials(name, unit_of_measure)), payments(*), suppliers(name)')
        .eq('company_id', id)
        .gte('purchase_date', f0)
        .lte('purchase_date', t0)
        .order('purchase_date', { ascending: false })
        .order('number', { ascending: false })
        .range(f, t)
    )
  );
}

export function usePayments(companyId: string | undefined, from: string | null) {
  return useSWR(companyId && from ? ['payments', companyId, from] : null, async ([, id, f0]) =>
    fetchAll((f, t) =>
      supabase
        .from('payments')
        .select('id, direction, payment_date, amount, voided_at')
        .eq('company_id', id)
        .gte('payment_date', f0)
        .range(f, t)
    )
  );
}

export function useExpenses(companyId: string | undefined, from: string, to: string) {
  return useSWR(companyId ? ['expenses', companyId, from, to] : null, async ([, id, f0, t0]) =>
    fetchAll((f, t) =>
      supabase
        .from('expenses')
        .select('*')
        .eq('company_id', id)
        .gte('expense_date', f0)
        .lte('expense_date', t0)
        .order('expense_date', { ascending: false })
        .range(f, t)
    )
  );
}

export function mapExpenses(rows: Row[] | undefined) {
  return (rows ?? []).map(mapExpense);
}

export function useProductionOrders(companyId?: string) {
  return useSWR(companyId ? ['production_orders', companyId] : null, async ([, id]) =>
    fetchAll((f, t) =>
      supabase
        .from('production_orders')
        .select('*, products(name, sku, batch_size), production_consumptions(*, materials(name, unit_of_measure))')
        .eq('company_id', id)
        .order('planned_date', { ascending: false })
        .order('number', { ascending: false })
        .range(f, t)
    )
  );
}

export function useCostHistory(companyId?: string) {
  return useSWR(companyId ? ['material_cost_history', companyId] : null, async ([, id]) =>
    (
      await fetchAll((f, t) =>
        supabase.from('material_cost_history').select('*').eq('company_id', id).order('effective_at').range(f, t)
      )
    ).map(mapCostChange)
  );
}

export function usePriceHistory(companyId?: string) {
  return useSWR(companyId ? ['product_price_history', companyId] : null, async ([, id]) =>
    (
      await fetchAll((f, t) =>
        supabase.from('product_price_history').select('*').eq('company_id', id).order('effective_at').range(f, t)
      )
    ).map(mapPriceChange)
  );
}

export function useInventoryTransactions(companyId: string | undefined, limit = 300) {
  return useSWR(companyId ? ['inventory_transactions', companyId, limit] : null, async ([, id, l]) => {
    const { data, error } = await supabase
      .from('inventory_transactions')
      .select('*')
      .eq('company_id', id)
      .order('created_at', { ascending: false })
      .limit(l as number);
    if (error) throw error;
    return data ?? [];
  });
}

export function useDistributorOrders(companyId?: string) {
  return useSWR(companyId ? ['distributor_orders', companyId] : null, async ([, id]) =>
    fetchAll((f, t) =>
      supabase
        .from('distributor_orders')
        .select(
          '*, distributors(name, payment_terms_days, credit_limit), distributor_order_lines(*, products(name, sku, current_stock)), invoice:invoices!distributor_orders_invoice_id_fkey(number)'
        )
        .eq('company_id', id)
        .order('created_at', { ascending: false })
        .range(f, t)
    )
  );
}

// ---------------------------------------------------------------------------
// Team and portal access
// ---------------------------------------------------------------------------
export function useTeam(companyId?: string) {
  return useSWR(companyId ? ['team', companyId] : null, async () => {
    const { data, error } = await supabase.rpc('list_team_members');
    if (error) throw error;
    return (data ?? []) as { user_id: string; full_name: string | null; email: string; role: string; created_at: string }[];
  });
}

export function useInvitations(companyId?: string) {
  return useSWR(companyId ? ['company_invitations', companyId] : null, async ([, id]) => {
    const { data, error } = await supabase
      .from('company_invitations')
      .select('*, distributors(name)')
      .eq('company_id', id)
      .is('accepted_at', null)
      .is('revoked_at', null)
      .order('created_at', { ascending: false });
    if (error) throw error;
    return data ?? [];
  });
}

export function usePortalUsers(companyId?: string) {
  return useSWR(companyId ? ['portal_users', companyId] : null, async () => {
    const { data, error } = await supabase.rpc('list_distributor_portal_users');
    if (error) throw error;
    return (data ?? []) as { id: string; distributor_id: string; user_id: string; email: string; created_at: string }[];
  });
}

/** Calls an RPC and throws on error so callers can show a friendly message. */
export async function rpc<T = unknown>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}
