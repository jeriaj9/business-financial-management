'use client';

import useSWR from 'swr';
import { supabase } from '@/lib/supabase';

export interface CatalogItem {
  product_id: string;
  name: string;
  sku: string | null;
  category: string | null;
  description: string | null;
  unit_price: number;
  suggested_retail_price: number;
  available: boolean;
}

export interface PortalOrder {
  id: string;
  number: string;
  status: 'submitted' | 'invoiced' | 'rejected' | 'cancelled';
  created_at: string;
  requested_date: string | null;
  notes: string | null;
  total: number;
  rejection_reason: string | null;
  invoice_number: string | null;
  lines: { product_name: string; sku: string | null; quantity: number; unit_price: number; line_total: number }[];
}

export interface PortalStatement {
  summary: {
    total_invoiced: number;
    total_paid: number;
    balance: number;
    overdue: number;
    credit_limit: number | null;
    available_credit: number | null;
    payment_terms_days: number;
  };
  invoices: {
    id: string;
    number: string;
    issue_date: string;
    due_date: string;
    total: number;
    amount_paid: number;
    balance: number;
    payment_status: 'paid' | 'overdue' | 'partial' | 'pending';
    lines: { product_name: string; quantity: number; unit_price: number; discount_pct: number; line_total: number }[];
  }[];
  payments: { payment_date: string; amount: number; method: string | null; reference: string | null; invoice_number: string }[];
}

async function call<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export function usePortalCatalog(distributorId: string) {
  return useSWR(['portal_catalog', distributorId], () =>
    call<CatalogItem[]>('portal_catalog', { p_distributor_id: distributorId }).then((rows) =>
      rows.map((r) => ({ ...r, unit_price: Number(r.unit_price), suggested_retail_price: Number(r.suggested_retail_price) }))
    )
  );
}

export function usePortalOrders(distributorId: string) {
  return useSWR(['portal_orders', distributorId], () => call<PortalOrder[]>('portal_orders', { p_distributor_id: distributorId }));
}

export function usePortalStatement(distributorId: string) {
  return useSWR(['portal_statement', distributorId], () => call<PortalStatement>('portal_statement', { p_distributor_id: distributorId }));
}

export { call as portalCall };
