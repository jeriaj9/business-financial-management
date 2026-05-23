'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Search, Filter, MoreHorizontal, FileText, Phone, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export default function DistributorsPage() {
  const [searchTerm, setSearchTerm] = useState("");
  const [distributors, setDistributors] = useState<any[]>([]);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [formData, setFormData] = useState({ name: "", contact: "", email: "", phone: "", tier: "Standard" });

  useEffect(() => {
    loadDistributors();
  }, []);

  async function loadDistributors() {
    const { data } = await supabase.from('distributors').select('*').order('name');
    if (data) {
      setDistributors(data.map(d => ({
        id: d.id,
        name: d.name,
        contact: d.contact_name || "",
        email: d.email || "",
        phone: d.phone || "",
        tier: d.pricing_tier || "Standard",
        balance: Number(d.outstanding_balance || 0),
        orders: 0 
      })));
    }
  }

  const handleAddDistributor = async () => {
    const { error } = await supabase.from('distributors').insert([{
      name: formData.name,
      contact_name: formData.contact,
      email: formData.email,
      phone: formData.phone,
      pricing_tier: formData.tier,
      outstanding_balance: 0
    }]);

    if (!error) {
      loadDistributors();
    }
    
    setIsAddOpen(false);
    setFormData({ name: "", contact: "", email: "", phone: "", tier: "Standard" });
  };

  const totalOutstanding = distributors.reduce((sum, d) => sum + d.balance, 0);

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Distributors</h1>
          <p className="text-muted-foreground mt-1">Manage wholesale clients, pricing tiers, and account balances.</p>
        </div>
        
        <Button onClick={() => setIsAddOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Distributor
        </Button>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>New Distributor Profile</DialogTitle>
              <DialogDescription>Create a new wholesale account for specific pricing rules.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Business Name</Label>
                <Input id="name" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="e.g. Acme Corp" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="contact">Contact Person</Label>
                  <Input id="contact" value={formData.contact} onChange={e => setFormData({...formData, contact: e.target.value})} placeholder="John Doe" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input id="phone" value={formData.phone} onChange={e => setFormData({...formData, phone: e.target.value})} placeholder="(809) 555-0000" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="email">Email Address</Label>
                <Input id="email" type="email" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} placeholder="john@example.com" />
              </div>
              <div className="grid gap-2">
                <Label htmlFor="tier">Pricing Tier</Label>
                <Select value={formData.tier} onValueChange={v => setFormData({...formData, tier: v || "Standard"})}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select tier" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Standard">Standard (20% Margin)</SelectItem>
                    <SelectItem value="Gold">Gold (30% Margin)</SelectItem>
                    <SelectItem value="Platinum">Platinum (40% Margin)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>Cancel</Button>
              <Button onClick={handleAddDistributor}>Create Profile</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Distributors</CardTitle>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{distributors.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Outstanding Balances</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-destructive">DOP {totalOutstanding.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <div className="bg-card border rounded-lg flex flex-col overflow-hidden flex-1">
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search distributors..."
              className="pl-9"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <Button variant="outline" size="sm">
            <Filter className="h-4 w-4 mr-2" />
            Filter
          </Button>
        </div>
        
        <div className="relative w-full overflow-auto">
          <Table>
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Distributor</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Pricing Tier</TableHead>
                <TableHead className="text-right">Orders</TableHead>
                <TableHead className="text-right">Balance</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {distributors.filter(d => d.name.toLowerCase().includes(searchTerm.toLowerCase())).map((distributor) => (
                <TableRow key={distributor.id}>
                  <TableCell className="font-medium">
                    {distributor.name}
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className="flex items-center"><Mail className="h-3 w-3 mr-1"/>{distributor.email}</span>
                      <span className="flex items-center"><Phone className="h-3 w-3 mr-1"/>{distributor.phone}</span>
                    </div>
                  </TableCell>
                  <TableCell>{distributor.contact}</TableCell>
                  <TableCell>
                    <span className="inline-flex items-center rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-semibold text-primary">
                      {distributor.tier}
                    </span>
                  </TableCell>
                  <TableCell className="text-right">{distributor.orders}</TableCell>
                  <TableCell className="text-right">
                    {distributor.balance > 0 ? (
                      <span className="text-destructive font-medium">DOP {distributor.balance.toLocaleString()}</span>
                    ) : (
                      <span className="text-muted-foreground">Settled</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <Button variant="ghost" className="h-8 w-8 p-0">
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
