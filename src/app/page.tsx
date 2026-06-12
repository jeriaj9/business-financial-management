'use client';

import { useState, useMemo } from "react";
import { useAuth } from "@/components/AuthProvider";
import { useDashboardData } from "@/lib/hooks";
import { PageLoader } from "@/components/PageLoader";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { 
  DollarSign, 
  TrendingUp, 
  Activity, 
  CreditCard,
  PieChart as PieChartIcon
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
  Legend
} from 'recharts';

export default function Home() {
  const { profile } = useAuth();
  const companyId = profile?.company_id;
  const { data: dashboardData, isLoading } = useDashboardData(companyId);

  // If profile exists but company_id is missing, don't stay loading forever
  if (profile && !companyId) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4 text-center">
        <h2 className="text-2xl font-bold text-destructive">No Company Assigned</h2>
        <p className="text-muted-foreground">Your account is not linked to any company workspace. Please contact your administrator.</p>
      </div>
    );
  }

  const { chartData, productData, metrics } = useMemo(() => {
    if (!dashboardData) {
      return {
        chartData: [],
        productData: [],
        metrics: {
          totalRevenue: 0,
          grossProfit: 0,
          totalExpenses: 0,
          netProfitMargin: 0,
          netIncome: 0,
          breakEvenRevenue: 0,
          breakEvenProgress: 0,
          averageMarginPercent: 0
        }
      };
    }

    const { products, sales, expenses } = dashboardData;

    // Initialize last 6 months
    const monthly: Record<string, {name: string, revenue: number, expenses: number, monthId: string}> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date();
      d.setMonth(d.getMonth() - i);
      const mName = d.toLocaleString('default', { month: 'short' });
      const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthly[mKey] = { name: mName, revenue: 0, expenses: 0, monthId: mKey };
    }

    const prodPerf: Record<string, {name: string, sales: number, profit: number}> = {};

    const productMap: Record<string, string> = {};
    if (products) {
      products.forEach((p: any) => productMap[p.id] = p.name);
    }

    // Calculate Sales
    let totalRev = 0;
    let totalGP = 0;
    if (sales) {
      sales.forEach((s: any) => {
        totalRev += Number(s.total_revenue);
        totalGP += Number(s.gross_profit);
        
        const d = new Date(s.sale_date);
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthly[mKey]) monthly[mKey].revenue += Number(s.total_revenue);

        const pName = (s.product_id && productMap[s.product_id]) ? productMap[s.product_id] : (s.channel === 'B2B' ? 'Wholesale Bundle' : 'Custom Item');
        if (!prodPerf[pName]) prodPerf[pName] = { name: pName, sales: 0, profit: 0 };
        prodPerf[pName].sales += Number(s.quantity);
        prodPerf[pName].profit += Number(s.gross_profit);
      });
    }

    // Calculate Expenses
    let totalExp = 0;
    if (expenses) {
      expenses.forEach((e: any) => {
        totalExp += Number(e.amount);
        
        const d = new Date(e.expense_date);
        const mKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        if (monthly[mKey]) monthly[mKey].expenses += Number(e.amount);
      });
    }

    // Calculate Metrics
    const netInc = totalGP - totalExp;
    const netMargin = totalRev > 0 ? (netInc / totalRev) * 100 : 0;
    const avgContMargin = totalRev > 0 ? (totalGP / totalRev) : 0;
    
    const beRev = avgContMargin > 0 ? (totalExp / avgContMargin) : 0;
    const beProgress = beRev > 0 ? Math.min((totalRev / beRev) * 100, 100) : 0;

    return {
      chartData: Object.values(monthly),
      productData: Object.values(prodPerf).sort((a, b) => b.sales - a.sales).slice(0, 5),
      metrics: {
        totalRevenue: totalRev,
        grossProfit: totalGP,
        totalExpenses: totalExp,
        netProfitMargin: netMargin,
        netIncome: netInc,
        breakEvenRevenue: beRev,
        breakEvenProgress: beProgress,
        averageMarginPercent: avgContMargin * 100
      }
    };
  }, [dashboardData]);

  if (isLoading) return <PageLoader />;

  return (
    <div className="flex flex-col gap-6 h-full pb-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Executive Dashboard</h1>
          <p className="text-muted-foreground mt-1">High-level financial overview and break-even analysis for Arelum.</p>
        </div>
      </div>

      <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Total Revenue
            </CardTitle>
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <DollarSign className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-emerald-600">DOP {metrics.totalRevenue.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">
              +20.1% from last month
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Gross Profit
            </CardTitle>
            <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
              <TrendingUp className="h-4 w-4 text-primary" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {metrics.grossProfit.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">
              {metrics.averageMarginPercent.toFixed(1)}% Average Margin
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Expenses</CardTitle>
            <div className="h-8 w-8 rounded-full bg-destructive/10 flex items-center justify-center">
              <CreditCard className="h-4 w-4 text-destructive" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">DOP {metrics.totalExpenses.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</div>
            <p className="text-xs text-muted-foreground">
              +4% from last month
            </p>
          </CardContent>
        </Card>
        <Card className="hover:shadow-md hover:-translate-y-0.5 transition-all duration-300">
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">
              Net Profit Margin
            </CardTitle>
            <div className="h-8 w-8 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{metrics.netProfitMargin.toFixed(1)}%</div>
            <p className="text-xs text-muted-foreground">
              DOP {metrics.netIncome.toLocaleString(undefined, {maximumFractionDigits: 0})} Net Income
            </p>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 grid-cols-1 lg:grid-cols-7">
        {/* Main Chart */}
        <Card className="col-span-1 lg:col-span-4 flex flex-col hover:shadow-sm transition-all duration-300">
          <CardHeader>
            <CardTitle>Revenue vs Expenses</CardTitle>
            <CardDescription>
              6-month historical view of cash flow generation.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 min-h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={chartData}
                margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                  </linearGradient>
                  <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#ef4444" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <XAxis 
                  dataKey="name" 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                />
                <YAxis 
                  stroke="#888888" 
                  fontSize={12} 
                  tickLine={false} 
                  axisLine={false} 
                  tickFormatter={(value) => `$${value / 1000}k`}
                />
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" opacity={0.2} />
                <Tooltip 
                  contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  itemStyle={{ color: 'hsl(var(--foreground))' }}
                />
                <Legend />
                <Area type="monotone" dataKey="revenue" name="Revenue" stroke="#10b981" fillOpacity={1} fill="url(#colorRevenue)" />
                <Area type="monotone" dataKey="expenses" name="Expenses" stroke="#ef4444" fillOpacity={1} fill="url(#colorExpenses)" />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        {/* Break-Even & Top Products */}
        <div className="col-span-1 lg:col-span-3 flex flex-col gap-6">
          <Card className="hover:shadow-sm transition-all duration-300">
            <CardHeader className="pb-4">
              <CardTitle className="flex items-center gap-2">
                <PieChartIcon className="h-5 w-5 text-primary" />
                Break-Even Analysis (This Month)
              </CardTitle>
              <CardDescription>
                Fixed overhead vs contribution margin targets.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex justify-between items-end mb-2">
                <div>
                  <p className="text-sm font-medium">Target to Break Even</p>
                  <p className="text-2xl font-bold">DOP {metrics.breakEvenRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
                <div className="text-right">
                  <p className="text-sm text-muted-foreground">Current</p>
                  <p className="text-xl font-bold text-emerald-600">DOP {metrics.totalRevenue.toLocaleString(undefined, { maximumFractionDigits: 0 })}</p>
                </div>
              </div>
              <div className="h-4 w-full bg-secondary rounded-full overflow-hidden mt-4">
                <div 
                  className={`h-full transition-all duration-500 ${metrics.breakEvenProgress >= 100 ? 'bg-emerald-500' : 'bg-primary'}`} 
                  style={{ width: `${metrics.breakEvenProgress}%` }} 
                />
              </div>
              <p className="text-xs text-muted-foreground mt-3 text-center">
                {metrics.breakEvenProgress >= 100 
                  ? "🎉 You have surpassed your break-even point and are now generating net profit!" 
                  : `You need DOP ${(metrics.breakEvenRevenue - metrics.totalRevenue).toLocaleString(undefined, { maximumFractionDigits: 0 })} more in sales to cover fixed costs.`}
              </p>
            </CardContent>
          </Card>

          <Card className="flex-1 hover:shadow-sm transition-all duration-300">
            <CardHeader>
              <CardTitle>Top Performing Products</CardTitle>
              <CardDescription>Highest gross profit contributors.</CardDescription>
            </CardHeader>
            <CardContent className="min-h-[220px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={productData} layout="vertical" margin={{ top: 0, right: 0, left: 30, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis 
                    dataKey="name" 
                    type="category" 
                    axisLine={false} 
                    tickLine={false} 
                    width={120}
                    style={{ fontSize: '11px' }}
                  />
                  <Tooltip 
                    cursor={{ fill: 'hsl(var(--secondary))' }}
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                  />
                  <Bar dataKey="profit" name="Gross Profit (DOP)" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
