'use client';

import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Plus, Search, Filter, PackageOpen, ArrowRight, DollarSign, ListPlus, Calculator, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
} from "@/components/ui/dialog";
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
import { calculateCosts, GlobalSettings, Material } from "@/lib/pricing";

export default function ProductsPage() {
  const { profile } = useAuth();
  const [searchTerm, setSearchTerm] = useState("");
  const [products, setProducts] = useState<any[]>([]);
  const [selectedProduct, setSelectedProduct] = useState<any>(null);
  
  const [globalSettings, setGlobalSettings] = useState({
    laborCostPerHour: 100,
    distributorMargin: 0.20,
    promotionalDiscount: 0.20,
    indirectCostReserve: 0.10,
  });
  const [availableMaterials, setAvailableMaterials] = useState<any[]>([]);

  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [newProductForm, setNewProductForm] = useState({ name: "", sku: "", category: "", targetMargin: "60" });
  const [isAddIngredientOpen, setIsAddIngredientOpen] = useState(false);
  const [editingBomItem, setEditingBomItem] = useState<any>(null);
  const [newIngredientForm, setNewIngredientForm] = useState({ materialId: "", quantity: "" });
  const [paramsForm, setParamsForm] = useState({
    batchSize: "1",
    productionTimeHours: "0",
    targetMargin: "60",
    currentStock: "0"
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    // Load Settings
    const { data: settingsData } = await supabase.from('settings').select('*').limit(1).single();
    if (settingsData) {
      setGlobalSettings({
        laborCostPerHour: Number(settingsData.labor_cost_per_hour),
        distributorMargin: Number(settingsData.distributor_margin),
        promotionalDiscount: Number(settingsData.promotional_discount),
        indirectCostReserve: Number(settingsData.indirect_cost_reserve)
      });
    }

    // Load Materials
    const { data: materialsData } = await supabase.from('materials').select('*');
    if (materialsData) {
      setAvailableMaterials(materialsData.map((m: any) => ({
        id: m.id,
        name: m.name,
        cost: Number(m.cost_per_unit),
        unit: m.unit_of_measure
      })));
    }

    // Load Products with BOM
    const { data: productsData } = await supabase.from('products').select('*, bom:bom_items(*)').order('name');
    if (productsData) {
      const mappedProducts = productsData.map((p: any) => ({
        id: p.id,
        sku: p.sku || "",
        name: p.name,
        category: p.category || "",
        batchSize: Number(p.batch_size),
        productionTimeHours: Number(p.production_time_hours),
        targetMargin: Number(p.target_margin),
        currentStock: Number(p.current_stock || 0),
        bom: p.bom.map((b: any) => ({
          id: b.id,
          materialId: b.material_id,
          quantity: Number(b.quantity)
        }))
      }));
      setProducts(mappedProducts);
      if (mappedProducts.length > 0) {
        setSelectedProduct(mappedProducts[0]);
        setParamsForm({
          batchSize: mappedProducts[0].batchSize.toString(),
          productionTimeHours: mappedProducts[0].productionTimeHours.toString(),
          targetMargin: (mappedProducts[0].targetMargin * 100).toString(),
          currentStock: mappedProducts[0].currentStock.toString()
        });
      }
    }
  }

  const handleCreateProduct = async () => {
    const { data, error } = await supabase.from('products').insert([{
      sku: newProductForm.sku,
      name: newProductForm.name,
      category: newProductForm.category,
      batch_size: 1,
      production_time_hours: 0,
      target_margin: Number(newProductForm.targetMargin) / 100,
      company_id: profile?.company_id
    }]).select('*, bom:bom_items(*)').single();

    if (data) {
      const newP = {
        id: data.id,
        sku: data.sku || "",
        name: data.name,
        category: data.category || "",
        batchSize: Number(data.batch_size),
        productionTimeHours: Number(data.production_time_hours),
        targetMargin: Number(data.target_margin),
        currentStock: Number(data.current_stock || 0),
        bom: []
      };
      setProducts([...products, newP]);
      setSelectedProduct(newP);
      setParamsForm({
        batchSize: newP.batchSize.toString(),
        productionTimeHours: newP.productionTimeHours.toString(),
        targetMargin: (newP.targetMargin * 100).toString(),
        currentStock: newP.currentStock.toString()
      });
    }
    setIsNewProductOpen(false);
  };

  const handleAddIngredient = async () => {
    if (!newIngredientForm.materialId || !newIngredientForm.quantity || !selectedProduct) return;
    
    if (editingBomItem) {
      const { data, error } = await supabase.from('bom_items').update({
        material_id: newIngredientForm.materialId,
        quantity: Number(newIngredientForm.quantity)
      }).eq('id', editingBomItem.id).select('*').single();

      if (data) {
        const updatedProduct = {
          ...selectedProduct,
          bom: selectedProduct.bom.map((b: any) => b.id === editingBomItem.id ? { 
            id: data.id,
            materialId: data.material_id, 
            quantity: Number(data.quantity) 
          } : b)
        };
        setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
        setSelectedProduct(updatedProduct);
      }
      setIsAddIngredientOpen(false);
      setEditingBomItem(null);
      setNewIngredientForm({ materialId: "", quantity: "" });
    } else {
      const { data, error } = await supabase.from('bom_items').insert([{
        product_id: selectedProduct.id,
        material_id: newIngredientForm.materialId,
        quantity: Number(newIngredientForm.quantity)
      }]).select('*').single();
      
      if (data) {
        const updatedProduct = {
          ...selectedProduct,
          bom: [...selectedProduct.bom, { 
            id: data.id,
            materialId: data.material_id, 
            quantity: Number(data.quantity) 
          }]
        };
        setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
        setSelectedProduct(updatedProduct);
      }
      // Keep modal open to allow multiple additions
      setNewIngredientForm({ materialId: "", quantity: "" });
    }
  };

  const handleOpenEditIngredient = (item: any) => {
    setEditingBomItem(item);
    setNewIngredientForm({ materialId: item.materialId, quantity: item.quantity.toString() });
    setIsAddIngredientOpen(true);
  };

  const handleDeleteIngredient = async (bomItemId: string) => {
    if (!confirm("Remove this ingredient from the recipe?")) return;
    const { error } = await supabase.from('bom_items').delete().eq('id', bomItemId);
    if (!error && selectedProduct) {
      const updatedProduct = {
        ...selectedProduct,
        bom: selectedProduct.bom.filter((b: any) => b.id !== bomItemId)
      };
      setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      setSelectedProduct(updatedProduct);
    }
  };

  const handleSaveParams = async () => {
    if (!selectedProduct) return;
    const updatedBatch = Number(paramsForm.batchSize);
    const updatedHours = Number(paramsForm.productionTimeHours);
    const updatedMargin = Number(paramsForm.targetMargin) / 100;
    const updatedStock = Number(paramsForm.currentStock);
    
    const { error } = await supabase.from('products').update({
      batch_size: updatedBatch,
      production_time_hours: updatedHours,
      target_margin: updatedMargin,
      current_stock: updatedStock
    }).eq('id', selectedProduct.id);
    
    if (!error) {
      const updatedProduct = {
        ...selectedProduct,
        batchSize: updatedBatch,
        productionTimeHours: updatedHours,
        targetMargin: updatedMargin,
        currentStock: updatedStock
      };
      
      setProducts(products.map(p => p.id === updatedProduct.id ? updatedProduct : p));
      setSelectedProduct(updatedProduct);
    }
  };

  // Costing Engine Calculations
  const costs = calculateCosts(selectedProduct, availableMaterials, globalSettings);

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] gap-6 overflow-hidden pb-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products & Costing Engine</h1>
          <p className="text-muted-foreground mt-1">Define product recipes (BOM) and calculate pricing automatically.</p>
        </div>
        
        <Button onClick={() => setIsNewProductOpen(true)}>
          <PackageOpen className="h-4 w-4 mr-2" />
          New Product
        </Button>
        <Dialog open={isNewProductOpen} onOpenChange={setIsNewProductOpen}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Product</DialogTitle>
              <DialogDescription>Initialize a new product to begin creating its Bill of Materials.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Product Name</Label>
                <Input id="name" value={newProductForm.name} onChange={e => setNewProductForm({...newProductForm, name: e.target.value})} placeholder="e.g. Lavender Candle" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="sku">SKU</Label>
                  <Input id="sku" value={newProductForm.sku} onChange={e => setNewProductForm({...newProductForm, sku: e.target.value})} placeholder="CND-001" />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" value={newProductForm.category} onChange={e => setNewProductForm({...newProductForm, category: e.target.value})} placeholder="Candle" />
                </div>
              </div>
              <div className="grid gap-2">
                <Label htmlFor="margin">Target Margin (%)</Label>
                <Input id="margin" type="number" value={newProductForm.targetMargin} onChange={e => setNewProductForm({...newProductForm, targetMargin: e.target.value})} />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsNewProductOpen(false)}>Cancel</Button>
              <Button onClick={handleCreateProduct}>Create</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="flex gap-6 flex-1 min-h-0">
        {/* Left Side: Product List */}
        <div className="w-1/3 flex flex-col bg-card border rounded-lg overflow-hidden h-full">
          <div className="p-4 border-b flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                type="search"
                placeholder="Search products..."
                className="pl-9 h-9"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>
          <div className="overflow-y-auto flex-1 p-2">
            {products.map((product) => (
              <div 
                key={product.id}
                onClick={() => {
                  setSelectedProduct(product);
                  setParamsForm({
                    batchSize: product.batchSize.toString(),
                    productionTimeHours: product.productionTimeHours.toString(),
                    targetMargin: (product.targetMargin * 100).toString(),
                    currentStock: product.currentStock.toString()
                  });
                }}
                className={`p-3 mb-2 rounded-md cursor-pointer transition-colors border ${selectedProduct.id === product.id ? 'bg-primary/5 border-primary' : 'bg-background border-transparent hover:border-border'}`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <p className="font-medium">{product.name}</p>
                  {selectedProduct.id === product.id && <ArrowRight className="h-4 w-4 text-primary" />}
                </div>
                <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                  <span>{product.sku}</span>
                  <span className="capitalize">{product.category}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Right Side: Costing Engine & BOM */}
        <div className="w-2/3 flex flex-col gap-4 overflow-y-auto h-full pb-8 pr-2">
          {selectedProduct ? (
            <>
              {/* Automated Pricing Calculator Dashboard */}
              <Card className="border-primary/20 bg-primary/5">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" />
                    Automated Pricing Calculator
                  </CardTitle>
                  <CardDescription>Based on BOM, labor, and global margin rules (DOP).</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                    <div className="bg-background border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Cost</p>
                      <p className="text-xl font-bold">${costs.totalCost.toFixed(2)}</p>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-center relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Retail Price</p>
                      <p className="text-xl font-bold text-emerald-600">${costs.retailPrice.toFixed(2)}</p>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Distributor Price</p>
                      <p className="text-xl font-bold">${costs.distributorPrice.toFixed(2)}</p>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-center">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Gross Profit</p>
                      <p className="text-xl font-bold text-emerald-600">${costs.grossProfit.toFixed(2)}</p>
                    </div>
                  </div>
                  
                  <div className="grid grid-cols-3 gap-2 mt-4 text-xs">
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground">Material Cost:</span>
                      <span className="font-medium">${costs.perUnitMaterialCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground">Labor Cost:</span>
                      <span className="font-medium">${costs.perUnitLaborCost.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between border-b pb-1">
                      <span className="text-muted-foreground">Indirect Cost ({globalSettings.indirectCostReserve * 100}%):</span>
                      <span className="font-medium">${costs.indirectCost.toFixed(2)}</span>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Bill of Materials Builder */}
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Bill of Materials (BOM)</CardTitle>
                    <CardDescription>Raw materials required for a batch of {selectedProduct.batchSize}.</CardDescription>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => setIsAddIngredientOpen(true)}>
                    <ListPlus className="h-4 w-4 mr-2" />
                    Add Ingredient
                  </Button>
                  <Dialog open={isAddIngredientOpen} onOpenChange={(open) => {
                    setIsAddIngredientOpen(open);
                    if (!open) {
                      setEditingBomItem(null);
                      setNewIngredientForm({ materialId: "", quantity: "" });
                    }
                  }}>
                    <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>{editingBomItem ? "Edit Ingredient" : "Add Ingredient to BOM"}</DialogTitle>
                        <DialogDescription>{editingBomItem ? "Update the quantity or raw material." : "Select a raw material and specify the quantity needed for one batch."}</DialogDescription>
                      </DialogHeader>
                      <div className="grid gap-4 py-4">
                        <div className="grid gap-2">
                          <Label>Raw Material</Label>
                          <Select value={newIngredientForm.materialId} onValueChange={v => setNewIngredientForm({...newIngredientForm, materialId: v || ""})}>
                            <SelectTrigger>
                              <SelectValue placeholder="Select raw material">
                                {newIngredientForm.materialId ? availableMaterials.find(m => m.id === newIngredientForm.materialId)?.name : "Select raw material"}
                              </SelectValue>
                            </SelectTrigger>
                            <SelectContent>
                              {availableMaterials.map(m => (
                                <SelectItem key={m.id} value={m.id}>{m.name} (${m.cost}/{m.unit})</SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="grid gap-2">
                          <Label>Quantity per Batch</Label>
                          <Input type="number" value={newIngredientForm.quantity} onChange={e => setNewIngredientForm({...newIngredientForm, quantity: e.target.value})} placeholder="0" />
                        </div>
                      </div>
                      <DialogFooter>
                        <Button variant="outline" onClick={() => {
                          setIsAddIngredientOpen(false);
                          setEditingBomItem(null);
                          setNewIngredientForm({ materialId: "", quantity: "" });
                        }}>Done</Button>
                        <Button onClick={handleAddIngredient}>{editingBomItem ? "Save Changes" : "Add to BOM"}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent className="max-h-[350px] overflow-y-auto">
                  <Table className="min-w-[800px] lg:min-w-full">
                    <TableHeader className="sticky top-0 bg-card z-10 shadow-sm">
                      <TableRow>
                        <TableHead>Material</TableHead>
                        <TableHead className="text-right">Qty</TableHead>
                        <TableHead className="text-right">Unit Cost</TableHead>
                        <TableHead className="text-right">Total Cost</TableHead>
                        <TableHead className="w-[80px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {selectedProduct.bom.map((item: any, idx: number) => {
                        const material = availableMaterials.find(m => m.id === item.materialId);
                        if (!material) return null;
                        const total = material.cost * item.quantity;
                        
                        return (
                          <TableRow key={idx}>
                            <TableCell className="font-medium">{material.name}</TableCell>
                            <TableCell className="text-right">{item.quantity} {material.unit}</TableCell>
                            <TableCell className="text-right">${material.cost.toFixed(2)}</TableCell>
                            <TableCell className="text-right font-medium">${total.toFixed(2)}</TableCell>
                            <TableCell>
                              <div className="flex items-center justify-end gap-1">
                                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleOpenEditIngredient(item)}>
                                  <Pencil className="h-3 w-3" />
                                </Button>
                                <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDeleteIngredient(item.id)}>
                                  <Trash2 className="h-3 w-3" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Production Parameters */}
              <Card key={selectedProduct.id}>
                <CardHeader>
                  <CardTitle>Production Parameters</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-6">
                    <div className="space-y-2">
                      <Label>Batch Size</Label>
                      <Input type="number" value={paramsForm.batchSize} onChange={(e) => setParamsForm({...paramsForm, batchSize: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Production Time (Hours)</Label>
                      <Input type="number" value={paramsForm.productionTimeHours} onChange={(e) => setParamsForm({...paramsForm, productionTimeHours: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Target Margin (%)</Label>
                      <Input type="number" value={paramsForm.targetMargin} onChange={(e) => setParamsForm({...paramsForm, targetMargin: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Current Stock</Label>
                      <Input type="number" value={paramsForm.currentStock} onChange={(e) => setParamsForm({...paramsForm, currentStock: e.target.value})} />
                    </div>
                  </div>
                  <Button className="mt-4 w-full" onClick={handleSaveParams}>Save Parameters</Button>
                </CardContent>
              </Card>

            </>
          ) : (
            <div className="flex items-center justify-center h-full text-muted-foreground border-2 border-dashed rounded-lg">
              Select a product to view its costing engine.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
