'use client';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Save, Copy, UserPlus, Shield, ShieldCheck, Eye } from "lucide-react";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { DataTable, ColumnDef } from "@/components/ui/data-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export default function SettingsPage() {
  const { profile } = useAuth();
  const [isSaving, setIsSaving] = useState(false);
  const [settingsId, setSettingsId] = useState<string | null>(null);
  const [teamMembers, setTeamMembers] = useState<any[]>([]);
  const [settings, setSettings] = useState({
    laborCostPerHour: 100,
    distributorMargin: 20,
    promotionalDiscount: 20,
    indirectCostReserve: 10,
    currency: 'DOP'
  });

  useEffect(() => {
    async function loadData() {
      // Load Settings
      const { data: sData } = await supabase.from('settings').select('*').limit(1).single();
      if (sData) {
        setSettingsId(sData.id);
        setSettings({
          laborCostPerHour: Number(sData.labor_cost_per_hour),
          distributorMargin: Number(sData.distributor_margin) * 100,
          promotionalDiscount: Number(sData.promotional_discount) * 100,
          indirectCostReserve: Number(sData.indirect_cost_reserve) * 100,
          currency: sData.currency
        });
      }

      // Load Team Members
      if (profile?.company_id) {
        const { data: tData } = await supabase.from('user_profiles').select('*').eq('company_id', profile.company_id);
        if (tData) {
          setTeamMembers(tData);
        }
      }
    }
    loadData();
  }, [profile]);

  const handleSave = async () => {
    if (!settingsId) return;
    setIsSaving(true);
    
    // Pass company_id manually in case the row didn't have it initialized
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

  const handleRoleChange = async (userId: string, newRole: string) => {
    const { error } = await supabase.from('user_profiles').update({ role: newRole }).eq('id', userId);
    if (!error) {
      setTeamMembers(teamMembers.map(t => t.id === userId ? { ...t, role: newRole } : t));
    } else {
      alert("Failed to update role. You might not have Admin privileges.");
    }
  };

  const teamColumns: ColumnDef<any>[] = [
    {
      header: "User",
      cell: (item) => (
        <div className="flex items-center gap-2 font-medium">
          <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold shrink-0">
            {(item.full_name || 'U')[0].toUpperCase()}
          </div>
          {item.full_name || 'Unknown User'}
        </div>
      )
    },
    {
      header: "Joined",
      className: "text-muted-foreground text-sm",
      cell: (item) => new Date(item.created_at).toLocaleDateString()
    },
    {
      header: "Role",
      className: "w-[150px]",
      cell: (item) => (
        <Select 
          value={item.role} 
          onValueChange={(v) => handleRoleChange(item.id, v)}
          disabled={profile?.role !== 'admin' || item.id === profile?.id}
        >
          <SelectTrigger className="h-8">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="view">
              <div className="flex items-center"><Eye className="h-4 w-4 mr-2 text-muted-foreground" /> View Only</div>
            </SelectItem>
            <SelectItem value="edit">
              <div className="flex items-center"><ShieldCheck className="h-4 w-4 mr-2 text-blue-500" /> Editor</div>
            </SelectItem>
            <SelectItem value="admin">
              <div className="flex items-center"><Shield className="h-4 w-4 mr-2 text-destructive" /> Admin</div>
            </SelectItem>
          </SelectContent>
        </Select>
      )
    }
  ];

  return (
    <div className="flex flex-col gap-6 max-w-4xl mx-auto">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">System Settings</h1>
          <p className="text-muted-foreground mt-1">Manage global financial rules and platform configurations.</p>
        </div>
        <Button onClick={handleSave} disabled={isSaving}>
          <Save className="h-4 w-4 mr-2" />
          {isSaving ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      <Tabs defaultValue="general" className="w-full">
        <TabsList className="mb-4">
          <TabsTrigger value="general">Financial Rules</TabsTrigger>
          <TabsTrigger value="team">Organization & Team</TabsTrigger>
        </TabsList>
        
        <TabsContent value="general" className="grid gap-6">
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
        </TabsContent>

        <TabsContent value="team" className="grid gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Organization Details</CardTitle>
              <CardDescription>
                Your workspace is isolated. To invite team members, share your unique Organization ID so they can join when they create an account.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 max-w-md">
                <Label>Organization Name</Label>
                <Input value={profile?.companies?.name || "Loading..."} readOnly className="bg-muted" />
              </div>
              <div className="space-y-2 max-w-md mt-4">
                <Label>Organization ID (Invite Code)</Label>
                <div className="flex gap-2">
                  <Input value={profile?.company_id || ""} readOnly className="bg-muted font-mono text-xs" />
                  <Button variant="outline" size="icon" onClick={() => navigator.clipboard.writeText(profile?.company_id || "")}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <div>
                <CardTitle>Team Members</CardTitle>
                <CardDescription>Manage access and roles for your organization.</CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => alert("Share the Organization ID above with new users so they can join upon registration.")}>
                <UserPlus className="h-4 w-4 mr-2" />
                Invite User
              </Button>
            </CardHeader>
            <CardContent>
              <DataTable
                data={teamMembers}
                columns={teamColumns}
                hideToolbar={true}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
