'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";

export default function SettingsPage() {
  const [isSaving, setIsSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [settings, setSettings] = useState({
    laborCostPerHour: 100,
    distributorMargin: 20,
    promotionalDiscount: 20,
    indirectCostReserve: 10,
    currency: 'DOP'
  });

  useEffect(() => {
    async function loadSettings() {
      const { data, error } = await supabase.from('settings').select('*').limit(1).single();
      if (data) {
        setSettingsId(data.id);
        setSettings({
          laborCostPerHour: Number(data.labor_cost_per_hour),
          distributorMargin: Number(data.distributor_margin) * 100,
          promotionalDiscount: Number(data.promotional_discount) * 100,
          indirectCostReserve: Number(data.indirect_cost_reserve) * 100,
          currency: data.currency
        });
      }
    }
    loadSettings();
  }, []);

  const handleSave = async () => {
    if (!settingsId) return;
    setIsSaving(true);
    
    const { error } = await supabase
      .from('settings')
      .update({
        labor_cost_per_hour: settings.laborCostPerHour,
        distributor_margin: settings.distributorMargin / 100,
        promotional_discount: settings.promotionalDiscount / 100,
        indirect_cost_reserve: settings.indirectCostReserve / 100,
        currency: settings.currency,
        updated_at: new Date().toISOString()
      })
      .eq('id', settingsId);
      
    setIsSaving(false);
  };

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground mt-1">Manage global financial rules and platform configurations.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Financial & Costing Rules</CardTitle>
            <CardDescription>
              These values act as the core variables for all BOM (Bill of Materials) and pricing calculations.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="currency">System Currency</Label>
                <Input 
                  id="currency" 
                  value={settings.currency} 
                  onChange={(e) => setSettings({...settings, currency: e.target.value})}
                />
                <p className="text-xs text-muted-foreground">Default currency for all reports.</p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="labor">Labor Cost Per Hour</Label>
                <div className="relative">
                  <span className="absolute left-3 top-2.5 text-muted-foreground">{settings.currency}</span>
                  <Input 
                    id="labor" 
                    type="number" 
                    className="pl-12"
                    value={settings.laborCostPerHour} 
                    onChange={(e) => setSettings({...settings, laborCostPerHour: Number(e.target.value)})}
                  />
                </div>
                <p className="text-xs text-muted-foreground">Used to calculate production costs based on time.</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              <div className="space-y-2">
                <Label htmlFor="dist_margin">Distributor Margin (%)</Label>
                <div className="relative">
                  <Input 
                    id="dist_margin" 
                    type="number"
                    value={settings.distributorMargin} 
                    onChange={(e) => setSettings({...settings, distributorMargin: Number(e.target.value)})}
                  />
                  <span className="absolute right-3 top-2.5 text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="promo_discount">Max Promo Discount (%)</Label>
                <div className="relative">
                  <Input 
                    id="promo_discount" 
                    type="number"
                    value={settings.promotionalDiscount} 
                    onChange={(e) => setSettings({...settings, promotionalDiscount: Number(e.target.value)})}
                  />
                  <span className="absolute right-3 top-2.5 text-muted-foreground">%</span>
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="indirect_cost">Indirect Cost Reserve (%)</Label>
                <div className="relative">
                  <Input 
                    id="indirect_cost" 
                    type="number"
                    value={settings.indirectCostReserve} 
                    onChange={(e) => setSettings({...settings, indirectCostReserve: Number(e.target.value)})}
                  />
                  <span className="absolute right-3 top-2.5 text-muted-foreground">%</span>
                </div>
                <p className="text-xs text-muted-foreground">Buffer for uncalculated overhead.</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
