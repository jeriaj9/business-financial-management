'use client';

import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { Plus, Search, Filter, PackageOpen, ArrowRight, DollarSign, ListPlus, Calculator, Pencil, Trash2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { calculateCosts, GlobalSettings, Material } from "@/lib/pricing";

export default function ProductsPage() {
  const { profile } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
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

  // Modals
  const [isNewProductOpen, setIsNewProductOpen] = useState(false);
  const [isEditProductOpen, setIsEditProductOpen] = useState(false);
  const [isAddIngredientOpen, setIsAddIngredientOpen] = useState(false);
  
  // Forms
  const [newProductForm, setNewProductForm] = useState({ name: "", sku: "", category: "", targetPrice: "20" });
  const [editProductForm, setEditProductForm] = useState({ name: "", sku: "", category: "" });
  const [editingBomItem, setEditingBomItem] = useState<any>(null);
  const [newIngredientForm, setNewIngredientForm] = useState({ materialId: "", quantity: "" });
  const [paramsForm, setParamsForm] = useState({
    batchSize: "1",
    productionTimeHours: "0",
    targetPrice: "0",
    currentStock: "0"
  });

  useEffect(() => {
    loadData();
  }, []);

  async function loadData() {
    setIsLoading(true);
    const { data: settingsData } = await supabase.from('settings').select('*').limit(1).single();
    if (settingsData) {
      setGlobalSettings({
        laborCostPerHour: Number(settingsData.labor_cost_per_hour),
        distributorMargin: Number(settingsData.distributor_margin),
        promotionalDiscount: Number(settingsData.promotional_discount),
        indirectCostReserve: Number(settingsData.indirect_cost_reserve)
      });
    }

    const { data: materialsData } = await supabase.from('materials').select('*');
    if (materialsData) {
      setAvailableMaterials(materialsData.map((m: any) => ({
        id: m.id,
        name: m.name,
        cost: Number(m.cost_per_unit),
        unit: m.unit_of_measure
      })));
    }

    const { data: productsData } = await supabase.from('products').select('*, bom:bom_items(*)').order('name');
    if (productsData) {
      const mappedProducts = productsData.map((p: any) => ({
        id: p.id,
        sku: p.sku || "",
        name: p.name,
        category: p.category || "",
        batchSize: Number(p.batch_size),
        productionTimeHours: Number(p.production_time_hours),
        targetMargin: Number(p.target_margin), // Keep for initial cost calc
        currentStock: Number(p.current_stock || 0),
        bom: p.bom.map((b: any) => ({
          id: b.id,
          materialId: b.material_id,
          quantity: Number(b.quantity)
        }))
      }));
      setProducts(mappedProducts);
      
      // Keep selection if it exists, else select first
      if (selectedProduct) {
        const found = mappedProducts.find(p => p.id === selectedProduct.id);
        if (found) {
           setSelectedProduct(found);
           const initCosts = calculateCosts(found, (materialsData || []).map((m: any) => ({ id: m.id, name: m.name, cost: Number(m.cost_per_unit), unit: m.unit_of_measure })), {
             laborCostPerHour: Number(settingsData?.labor_cost_per_hour || 100),
             distributorMargin: Number(settingsData?.distributor_margin || 0.20),
             promotionalDiscount: Number(settingsData?.promotional_discount || 0.20),
             indirectCostReserve: Number(settingsData?.indirect_cost_reserve || 0.10)
           });
           setParamsForm({
             batchSize: found.batchSize.toString(),
             productionTimeHours: found.productionTimeHours.toString(),
             targetPrice: initCosts.retailPrice.toFixed(2),
             currentStock: found.currentStock.toString()
           });
        }
      } else if (mappedProducts.length > 0) {
        setSelectedProduct(mappedProducts[0]);
        const initCosts = calculateCosts(mappedProducts[0], (materialsData || []).map((m: any) => ({ id: m.id, name: m.name, cost: Number(m.cost_per_unit), unit: m.unit_of_measure })), {
             laborCostPerHour: Number(settingsData?.labor_cost_per_hour || 100),
             distributorMargin: Number(settingsData?.distributor_margin || 0.20),
             promotionalDiscount: Number(settingsData?.promotional_discount || 0.20),
             indirectCostReserve: Number(settingsData?.indirect_cost_reserve || 0.10)
        });
        setParamsForm({
          batchSize: mappedProducts[0].batchSize.toString(),
          productionTimeHours: mappedProducts[0].productionTimeHours.toString(),
          targetPrice: initCosts.retailPrice.toFixed(2),
          currentStock: mappedProducts[0].currentStock.toString()
        });
      }
    }
    setIsLoading(false);
  }

  // --- Dynamic Pricing & Local State ---
  
  const previewProduct = selectedProduct ? {
    ...selectedProduct,
    batchSize: Number(paramsForm.batchSize) || 1,
    productionTimeHours: Number(paramsForm.productionTimeHours) || 0,
    targetPrice: Number(paramsForm.targetPrice) || 0
  } : null;

  const costs = calculateCosts(previewProduct, availableMaterials, globalSettings);

  // --- Actions ---

  const handleCreateProduct = async () => {
    setIsLoading(true);
    const { data, error } = await supabase.from('products').insert([{
      sku: newProductForm.sku,
      name: newProductForm.name,
      category: newProductForm.category,
      batch_size: 1,
      production_time_hours: 0,
      target_margin: 0, // Margin is calculated dynamically later
      company_id: profile?.company_id
    }]).select('*, bom:bom_items(*)').single();

    if (data) {
      await loadData();
      setIsNewProductOpen(false);
    } else {
      setIsLoading(false);
      alert("Error creating product");
    }
  };

  const handleSaveChanges = async () => {
    if (!selectedProduct) return;
    setIsLoading(true);
    
    // The engine automatically reverse-calculated the margin based on our targetPrice!
    const updatedMargin = costs.calculatedMargin;
    
    // Update Details & Params
    const { error: pError } = await supabase.from('products').update({
      name: selectedProduct.name,
      sku: selectedProduct.sku,
      category: selectedProduct.category,
      batch_size: Number(paramsForm.batchSize),
      production_time_hours: Number(paramsForm.productionTimeHours),
      target_margin: updatedMargin,
      current_stock: Number(paramsForm.currentStock)
    }).eq('id', selectedProduct.id);

    // Sync BOMs
    if (!pError) {
      await supabase.from('bom_items').delete().eq('product_id', selectedProduct.id);
      if (selectedProduct.bom.length > 0) {
        const bomInserts = selectedProduct.bom.map((b: any) => ({
          product_id: selectedProduct.id,
          material_id: b.materialId,
          quantity: b.quantity,
          company_id: profile?.company_id
        }));
        const { error: bomError } = await supabase.from('bom_items').insert(bomInserts);
        if (bomError) console.error("BOM Insert Error:", bomError);
      }
    }
    await loadData();
  };

  const handleDeleteProduct = async () => {
    if (!selectedProduct) return;
    if (!confirm(`Are you sure you want to completely delete "${selectedProduct.name}"? This cannot be undone.`)) return;
    
    setIsLoading(true);
    await supabase.from('products').delete().eq('id', selectedProduct.id);
    setSelectedProduct(null);
    await loadData();
  };

  const handleEditDetailsSave = () => {
    setSelectedProduct({
      ...selectedProduct,
      name: editProductForm.name,
      sku: editProductForm.sku,
      category: editProductForm.category
    });
    setIsEditProductOpen(false);
  };

  // --- Local BOM Actions ---

  const handleAddIngredient = () => {
    if (!newIngredientForm.materialId || !newIngredientForm.quantity || !selectedProduct) return;
    
    if (editingBomItem) {
      const updatedProduct = {
        ...selectedProduct,
        bom: selectedProduct.bom.map((b: any) => b.id === editingBomItem.id ? { 
          id: b.id,
          materialId: newIngredientForm.materialId, 
          quantity: Number(newIngredientForm.quantity) 
        } : b)
      };
      setSelectedProduct(updatedProduct);
      setIsAddIngredientOpen(false);
      setEditingBomItem(null);
      setNewIngredientForm({ materialId: "", quantity: "" });
    } else {
      const updatedProduct = {
        ...selectedProduct,
        bom: [...selectedProduct.bom, { 
          id: `local-${Date.now()}`, 
          materialId: newIngredientForm.materialId, 
          quantity: Number(newIngredientForm.quantity) 
        }]
      };
      setSelectedProduct(updatedProduct);
      setNewIngredientForm({ materialId: "", quantity: "" });
    }
  };

  const handleOpenEditIngredient = (item: any) => {
    setEditingBomItem(item);
    setNewIngredientForm({ materialId: item.materialId, quantity: item.quantity.toString() });
    setIsAddIngredientOpen(true);
  };

  const handleDeleteIngredient = (bomItemId: string) => {
    const updatedProduct = {
      ...selectedProduct,
      bom: selectedProduct.bom.filter((b: any) => b.id !== bomItemId)
    };
    setSelectedProduct(updatedProduct);
  };

  if (isLoading) return <PageLoader />;

  return (
    <div className="flex flex-col h-[calc(100vh-2rem)] gap-6 overflow-hidden pb-4">
      <div className="flex items-center justify-between shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Products & Costing Engine</h1>
          <p className="text-muted-foreground mt-1">Define recipes, customize prices, and save changes manually.</p>
        </div>
        
        <Button onClick={() => setIsNewProductOpen(true)}>
          <PackageOpen className="h-4 w-4 mr-2" />
          New Product
        </Button>
        <Dialog open={isNewProductOpen} onOpenChange={setIsNewProductOpen}>
          <DialogContent className="w-[95vw] sm:max-w-md max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create New Product</DialogTitle>
              <DialogDescription>Initialize a new product to begin creating its recipe.</DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label>Product Name</Label>
                <Input value={newProductForm.name} onChange={e => setNewProductForm({...newProductForm, name: e.target.value})} placeholder="e.g. Lavender Candle" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label>SKU</Label>
                  <Input value={newProductForm.sku} onChange={e => setNewProductForm({...newProductForm, sku: e.target.value})} placeholder="CND-001" />
                </div>
                <div className="grid gap-2">
                  <Label>Category</Label>
                  <Input value={newProductForm.category} onChange={e => setNewProductForm({...newProductForm, category: e.target.value})} placeholder="Candle" />
                </div>
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
        <div className="w-1/3 flex flex-col bg-card border rounded-lg overflow-hidden h-full shadow-sm">
          <div className="p-4 border-b flex items-center gap-2 bg-muted/20">
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
            {products.filter(p => p.name.toLowerCase().includes(searchTerm.toLowerCase())).map((product) => (
              <div 
                key={product.id}
                onClick={() => {
                  setSelectedProduct(product);
                  const initCosts = calculateCosts(product, availableMaterials, globalSettings);
                  setParamsForm({
                    batchSize: product.batchSize.toString(),
                    productionTimeHours: product.productionTimeHours.toString(),
                    targetPrice: initCosts.retailPrice.toFixed(2),
                    currentStock: product.currentStock.toString()
                  });
                }}
                className={`p-3 mb-2 rounded-md cursor-pointer transition-colors border ${selectedProduct?.id === product.id ? 'bg-primary/5 border-primary' : 'bg-background border-transparent hover:border-border'}`}
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                  <p className="font-medium">{product.name}</p>
                  {selectedProduct?.id === product.id && <ArrowRight className="h-4 w-4 text-primary" />}
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
              {/* Product Header & Actions */}
              <div className="flex items-center justify-between bg-card p-4 rounded-lg border shadow-sm shrink-0">
                <div>
                  <h2 className="text-xl font-bold">{selectedProduct.name}</h2>
                  <div className="flex gap-2 text-sm text-muted-foreground mt-1">
                    <span>SKU: {selectedProduct.sku || '-'}</span>
                    <span>•</span>
                    <span>Category: {selectedProduct.category || '-'}</span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => {
                    setEditProductForm({ name: selectedProduct.name, sku: selectedProduct.sku, category: selectedProduct.category });
                    setIsEditProductOpen(true);
                  }}>
                    <Pencil className="h-4 w-4 mr-2" />
                    Edit
                  </Button>
                  <Button variant="outline" size="sm" className="text-destructive border-destructive/20 hover:bg-destructive/10" onClick={handleDeleteProduct}>
                    <Trash2 className="h-4 w-4 mr-2" />
                    Delete
                  </Button>
                  <Button onClick={handleSaveChanges} className="bg-emerald-600 hover:bg-emerald-700 text-white">
                    <Save className="h-4 w-4 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>

              {/* Edit Details Dialog */}
              <Dialog open={isEditProductOpen} onOpenChange={setIsEditProductOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Edit Product Details</DialogTitle>
                    <DialogDescription>These changes will be saved to local state until you click Save Changes.</DialogDescription>
                  </DialogHeader>
                  <div className="grid gap-4 py-4">
                    <div className="grid gap-2">
                      <Label>Product Name</Label>
                      <Input value={editProductForm.name} onChange={e => setEditProductForm({...editProductForm, name: e.target.value})} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="grid gap-2">
                        <Label>SKU</Label>
                        <Input value={editProductForm.sku} onChange={e => setEditProductForm({...editProductForm, sku: e.target.value})} />
                      </div>
                      <div className="grid gap-2">
                        <Label>Category</Label>
                        <Input value={editProductForm.category} onChange={e => setEditProductForm({...editProductForm, category: e.target.value})} />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setIsEditProductOpen(false)}>Cancel</Button>
                    <Button onClick={handleEditDetailsSave}>Update Preview</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>

              {/* Automated Pricing Calculator Dashboard */}
              <Card className="border-primary/20 bg-primary/5 shrink-0">
                <CardHeader className="pb-2">
                  <CardTitle className="text-xl flex items-center gap-2">
                    <Calculator className="h-5 w-5 text-primary" />
                    Dynamic Pricing Calculator
                  </CardTitle>
                  <CardDescription>Metrics are instantly calculated based on your target retail price and live costs.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7 gap-4 items-end">
                    <div className="bg-background border rounded-lg p-3 text-center h-full flex flex-col justify-end">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Total Cost</p>
                      <p className="text-xl font-bold">${costs.totalCost.toFixed(2)}</p>
                    </div>
                    <div className="bg-background border border-emerald-500/30 rounded-lg p-3 relative overflow-hidden h-full flex flex-col justify-end">
                      <div className="absolute top-0 left-0 w-full h-1 bg-emerald-500"></div>
                      <Label className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1 block text-center">Target Retail Price</Label>
                      <p className="text-xl font-bold text-emerald-600 text-center">${costs.retailPrice.toFixed(2)}</p>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-center h-full flex flex-col justify-end">
                      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1">Calculated Margin</p>
                      <p className="text-xl font-bold">{(costs.calculatedMargin * 100).toFixed(2)}%</p>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-center h-full flex flex-col justify-end">
                      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1">Retail Profit</p>
                      <p className="text-xl font-bold text-emerald-600">${costs.grossProfit.toFixed(2)}</p>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-center h-full flex flex-col justify-end">
                      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1">Company Profit (Dist)</p>
                      <p className="text-xl font-bold text-emerald-600">${costs.retailProfitDist.toFixed(2)}</p>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-center h-full flex flex-col justify-end">
                      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1">Dist. Price</p>
                      <p className="text-xl font-bold">${costs.distributorPrice.toFixed(2)}</p>
                    </div>
                    <div className="bg-background border rounded-lg p-3 text-center h-full flex flex-col justify-end">
                      <p className="text-[10px] sm:text-xs text-muted-foreground uppercase tracking-wider mb-1">Dist. Profit</p>
                      <p className="text-xl font-bold text-blue-600">${costs.distributorProfit.toFixed(2)}</p>
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
              <Card className="shrink-0">
                <CardHeader className="flex flex-row items-center justify-between">
                  <div>
                    <CardTitle>Bill of Materials (BOM)</CardTitle>
                    <CardDescription>Raw materials required for a batch of {previewProduct.batchSize}.</CardDescription>
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
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>{editingBomItem ? "Edit Ingredient" : "Add Ingredient to BOM"}</DialogTitle>
                        <DialogDescription>{editingBomItem ? "Update local quantity." : "Select a raw material."}</DialogDescription>
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
                        }}>Cancel</Button>
                        <Button onClick={handleAddIngredient}>{editingBomItem ? "Update Preview" : "Add to Preview"}</Button>
                      </DialogFooter>
                    </DialogContent>
                  </Dialog>
                </CardHeader>
                <CardContent>
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
                      {selectedProduct.bom.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-muted-foreground py-6">
                            No materials added yet. Add ingredients to define the recipe.
                          </TableCell>
                        </TableRow>
                      ) : (
                        selectedProduct.bom.map((item: any, idx: number) => {
                          const material = availableMaterials.find(m => m.id === item.materialId);
                          if (!material) return null;
                          const total = material.cost * item.quantity;
                          
                          return (
                            <TableRow key={item.id || idx}>
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
                        })
                      )}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {/* Production Parameters */}
              <Card key={selectedProduct.id} className="shrink-0">
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
                      <Label>Target Retail Price ($)</Label>
                      <Input type="number" value={paramsForm.targetPrice} onChange={(e) => setParamsForm({...paramsForm, targetPrice: e.target.value})} />
                    </div>
                    <div className="space-y-2">
                      <Label>Current Stock</Label>
                      <Input type="number" value={paramsForm.currentStock} onChange={(e) => setParamsForm({...paramsForm, currentStock: e.target.value})} />
                    </div>
                  </div>
                  <div className="mt-6 flex justify-end">
                    <p className="text-xs text-muted-foreground mr-4 self-center italic">Changes are local until you click "Save Changes" at the top.</p>
                  </div>
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
