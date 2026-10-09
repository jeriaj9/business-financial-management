'use client';

// Loads and maps everything the decision engines need, so each analytics page is a thin view.
import { useMemo } from 'react';
import {
  mapExpenses,
  toSaleLines,
  useChannels,
  useCompany,
  useCostHistory,
  useExpenses,
  useMaterials,
  usePriceHistory,
  useProducts,
  useSalesLineRows,
} from './hooks';
import type { CostSettings } from '@/lib/domain/types';

export interface DatasetOptions {
  salesFrom: string;
  salesTo: string;
  expensesFrom?: string;
  expensesTo?: string;
  withHistory?: boolean;
}

export function useDataset(options: DatasetOptions) {
  const company = useCompany();
  const { companyId } = company;
  const products = useProducts(companyId);
  const materials = useMaterials(companyId);
  const channels = useChannels(companyId);
  const salesRows = useSalesLineRows(companyId, options.salesFrom, options.salesTo);
  const expenses = useExpenses(companyId, options.expensesFrom ?? options.salesFrom, options.expensesTo ?? options.salesTo);
  const costHistory = useCostHistory(options.withHistory ? companyId : undefined);
  const priceHistory = usePriceHistory(options.withHistory ? companyId : undefined);

  const sales = useMemo(() => toSaleLines(salesRows.data, products.data), [salesRows.data, products.data]);
  const expenseList = useMemo(() => mapExpenses(expenses.data), [expenses.data]);

  const costSettings: CostSettings | null = company.settings
    ? {
        laborCostPerHour: company.settings.laborCostPerHour,
        indirectCostReserve: company.settings.indirectCostReserve,
        laborIsVariable: company.settings.laborIsVariable,
        distributorMargin: company.settings.distributorMargin,
      }
    : null;

  const sources = [products, materials, channels, salesRows, expenses, ...(options.withHistory ? [costHistory, priceHistory] : [])];
  const isLoading = company.settingsLoading || sources.some((s) => s.isLoading && !s.data);
  const error = sources.find((s) => s.error)?.error;

  const channelName = (id: string) => channels.data?.find((c) => c.id === id)?.name ?? 'Canal';
  const productName = (id: string) => products.data?.find((p) => p.id === id)?.name ?? (id.startsWith('custom:') ? id.slice(7) : 'Producto');

  return {
    ...company,
    costSettings,
    products: products.data ?? [],
    materials: materials.data ?? [],
    channels: channels.data ?? [],
    sales,
    expenses: expenseList,
    costHistory: costHistory.data ?? [],
    priceHistory: priceHistory.data ?? [],
    isLoading,
    error,
    channelName,
    productName,
    reload: () => {
      void products.mutate();
      void materials.mutate();
      void channels.mutate();
      void salesRows.mutate();
      void expenses.mutate();
      void costHistory.mutate();
      void priceHistory.mutate();
    },
  };
}
