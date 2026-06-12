import useSWR from 'swr';
import { supabase } from '@/lib/supabase';

// Fetchers

const fetchDashboardData = async (companyId: string) => {
  if (!companyId) return null;

  // Calculate date 6 months ago
  const sixMonthsAgo = new Date();
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 5);
  sixMonthsAgo.setDate(1); // Start of that month
  const fromDate = sixMonthsAgo.toISOString().split('T')[0];

  const [
    { data: products },
    { data: sales },
    { data: expenses }
  ] = await Promise.all([
    supabase.from('products').select('*').eq('company_id', companyId),
    supabase.from('sales').select('*').eq('company_id', companyId).gte('sale_date', fromDate),
    supabase.from('expenses').select('*').eq('company_id', companyId).gte('expense_date', fromDate)
  ]);

  return { products, sales, expenses };
};

const fetchSales = async (companyId: string, page: number, pageSize: number) => {
  if (!companyId) return null;
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, count } = await supabase
    .from('sales')
    .select('*, products(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(from, to);
  return { data, count };
};

const fetchExpenses = async (companyId: string, page: number, pageSize: number) => {
  if (!companyId) return null;
  const from = page * pageSize;
  const to = from + pageSize - 1;
  const { data, count } = await supabase
    .from('expenses')
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .range(from, to);
  return { data, count };
};

// Hooks

export function useDashboardData(companyId: string | undefined) {
  return useSWR(
    companyId ? ['dashboard', companyId] : null,
    ([, id]) => fetchDashboardData(id as string)
  );
}

export function usePaginatedSales(companyId: string | undefined, page: number = 0, pageSize: number = 20) {
  return useSWR(
    companyId ? ['sales', companyId, page, pageSize] : null,
    ([, id, p, ps]) => fetchSales(id as string, p as number, ps as number)
  );
}

export function usePaginatedExpenses(companyId: string | undefined, page: number = 0, pageSize: number = 20) {
  return useSWR(
    companyId ? ['expenses', companyId, page, pageSize] : null,
    ([, id, p, ps]) => fetchExpenses(id as string, p as number, ps as number)
  );
}

export function useMaterials(companyId: string | undefined) {
  return useSWR(companyId ? ['materials', companyId] : null, async ([, id]) => {
    const { data } = await supabase.from('materials').select('*').eq('company_id', id).order('name');
    return data;
  });
}

export function useProducts(companyId: string | undefined) {
  return useSWR(companyId ? ['products', companyId] : null, async ([, id]) => {
    const { data } = await supabase.from('products').select('*, bom:bom_items(*)').eq('company_id', id).order('name');
    return data;
  });
}

export function useDistributors(companyId: string | undefined) {
  return useSWR(companyId ? ['distributors', companyId] : null, async ([, id]) => {
    const { data } = await supabase.from('distributors').select('*, sales(*)').eq('company_id', id).order('name');
    return data;
  });
}

export function useInventoryTransactions(companyId: string | undefined, limit: number = 200) {
  return useSWR(companyId ? ['inventory_transactions', companyId, limit] : null, async ([, id, l]) => {
    const { data } = await supabase.from('inventory_transactions').select('*').eq('company_id', id).order('created_at', { ascending: false }).limit(l as number);
    return data;
  });
}

export function useSettings(companyId: string | undefined) {
  return useSWR(companyId ? ['settings', companyId] : null, async ([, id]) => {
    const { data } = await supabase.from('settings').select('*').eq('company_id', id).limit(1).single();
    return data;
  });
}

// Re-export mutate globally for invalidation
export { mutate } from 'swr';
