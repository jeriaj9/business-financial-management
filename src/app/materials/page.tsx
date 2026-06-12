'use client';

import { useState, useEffect } from "react";
import { PageLoader } from "@/components/PageLoader";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/components/AuthProvider";
import { useMaterials } from "@/lib/hooks";
import { Plus, Search, Filter, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export default function MaterialsPage() {
  const { profile } = useAuth();
  const { data: materialsData, isLoading: isMaterialsLoading, mutate: mutateMaterials } = useMaterials(profile?.company_id);
  const [searchTerm, setSearchTerm] = useState("");
  const [materials, setMaterials] = useState<any[]>([]);

  useEffect(() => {
    if (materialsData) {
      setMaterials(materialsData.map((m: any) => ({
        id: m.id,
        name: m.name,
        category: m.category,
        supplier: m.supplier,
        unit: m.unit_of_measure,
        cost: Number(m.cost_per_unit),
        stock: Number(m.current_stock),
        reorder: Number(m.reorder_point)
      })));
    }
  }, [materialsData]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any>(null);

  // Form State
  const [formData, setFormData] = useState({
    name: "", category: "", unit: "", cost: "", supplier: "", stock: "", reorder: ""
  });

  const handleOpenModal = (material: any = null) => {
    if (material) {
      setEditingMaterial(material);
      setFormData({
        name: material.name,
        category: material.category.toLowerCase(),
        unit: material.unit,
        cost: material.cost.toString(),
        supplier: material.supplier,
        stock: material.stock.toString(),
        reorder: material.reorder.toString()
      });
    } else {
      setEditingMaterial(null);
      setFormData({ name: "", category: "", unit: "", cost: "", supplier: "", stock: "", reorder: "" });
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (editingMaterial) {
      // Update
      const { error } = await supabase.from('materials').update({
        name: formData.name,
        category: formData.category,
        supplier: formData.supplier,
        unit_of_measure: formData.unit,
        cost_per_unit: Number(formData.cost) || 0,
        current_stock: Number(formData.stock) || 0,
        reorder_point: Number(formData.reorder) || 0,
        updated_at: new Date().toISOString()
      }).eq('id', editingMaterial.id);

      if (error) {
        console.error("Update error:", error);
        alert(`Error saving: ${error.message}`);
      } else {
        mutateMaterials();
      }
    } else {
      // Create
      const { error } = await supabase.from('materials').insert([{
        name: formData.name,
        category: formData.category,
        supplier: formData.supplier,
        unit_of_measure: formData.unit,
        cost_per_unit: Number(formData.cost) || 0,
        current_stock: Number(formData.stock) || 0,
        reorder_point: Number(formData.reorder) || 0,
        company_id: profile?.company_id
      }]);

      if (error) {
        console.error("Insert error:", error);
        alert(`Error creating: ${error.message}`);
      } else {
        mutateMaterials();
      }
    }
    setIsModalOpen(false);
  };

  const handleDelete = async (id: string, name: string) => {
    // Check if material is used in any BOM
    const { data: usage } = await supabase.from('bom_items').select('product_id').eq('material_id', id);
    if (usage && usage.length > 0) {
      const isConfirmed = confirm(`WARNING: The material "${name}" is currently being used in ${usage.length} product(s)! Deleting it will permanently break their BOM recipes.\n\nAre you absolutely sure you want to delete it?`);
      if (!isConfirmed) return;
    } else {
      if (!confirm("Are you sure you want to delete this material?")) return;
    }

    await supabase.from('materials').delete().eq('id', id);
    mutateMaterials();
  };

  if (isMaterialsLoading) return <PageLoader />;

  return (
    <div className="flex flex-col gap-6 h-full">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Raw Materials</h1>
          <p className="text-muted-foreground mt-1">Manage your ingredients, packaging, and current stock levels.</p>
        </div>

        <Button onClick={() => handleOpenModal()}>
          <Plus className="h-4 w-4 mr-2" />
          Add Material
        </Button>

        <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
          <DialogContent className="w-[95vw] sm:max-w-[425px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingMaterial ? "Edit Material" : "Add New Material"}</DialogTitle>
              <DialogDescription>
                {editingMaterial ? "Update the details for this raw material." : "Register a new raw material to your inventory database."}
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid gap-2">
                <Label htmlFor="name">Material Name</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g. Soy Wax 464"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="category">Category</Label>
                  <Select value={formData.category} onValueChange={(v) => setFormData({ ...formData, category: v || "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select type" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="wax">Wax</SelectItem>
                      <SelectItem value="fragrance">Fragrance</SelectItem>
                      <SelectItem value="packaging">Packaging</SelectItem>
                      <SelectItem value="wick">Wick</SelectItem>
                      <SelectItem value="container">Container</SelectItem>
                      <SelectItem value="other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="unit">Unit of Measure</Label>
                  <Select value={formData.unit} onValueChange={(v) => setFormData({ ...formData, unit: v || "" })}>
                    <SelectTrigger>
                      <SelectValue placeholder="e.g. lb" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="lb">Pounds (lb)</SelectItem>
                      <SelectItem value="oz">Ounces (oz)</SelectItem>
                      <SelectItem value="kg">Kilograms (kg)</SelectItem>
                      <SelectItem value="g">Grams (g)</SelectItem>
                      <SelectItem value="unit">Units / Pieces</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="cost">Cost per Unit (DOP)</Label>
                  <Input
                    id="cost"
                    type="number"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    placeholder="0.00"
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="supplier">Supplier</Label>
                  <Input
                    id="supplier"
                    value={formData.supplier}
                    onChange={(e) => setFormData({ ...formData, supplier: e.target.value })}
                    placeholder="Supplier name"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="grid gap-2">
                  <Label htmlFor="stock">Current Stock</Label>
                  <Input
                    id="stock"
                    type="number"
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: e.target.value })}
                  />
                </div>
                <div className="grid gap-2">
                  <Label htmlFor="reorder">Reorder Point</Label>
                  <Input
                    id="reorder"
                    type="number"
                    value={formData.reorder}
                    onChange={(e) => setFormData({ ...formData, reorder: e.target.value })}
                  />
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsModalOpen(false)}>Cancel</Button>
              <Button type="submit" onClick={handleSave}>
                {editingMaterial ? "Update Material" : "Save Material"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <div className="bg-card border rounded-lg flex flex-col overflow-hidden">
        <div className="p-4 border-b flex items-center justify-between gap-4">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search materials..."
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
          <Table className="min-w-[800px] lg:min-w-full">
            <TableHeader className="bg-muted/50">
              <TableRow>
                <TableHead>Material Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Supplier</TableHead>
                <TableHead className="text-right">Unit Cost (DOP)</TableHead>
                <TableHead className="text-right">Stock</TableHead>
                <TableHead className="text-right">Status</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {materials.map((material) => {
                const isLowStock = material.stock <= material.reorder;

                return (
                  <TableRow key={material.id}>
                    <TableCell className="font-medium">{material.name}</TableCell>
                    <TableCell>
                      <span className="inline-flex items-center rounded-md bg-secondary px-2 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-inset ring-secondary-foreground/10 capitalize">
                        {material.category}
                      </span>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{material.supplier}</TableCell>
                    <TableCell className="text-right">${material.cost.toFixed(2)} /{material.unit}</TableCell>
                    <TableCell className="text-right font-medium">
                      {material.stock} {material.unit}
                    </TableCell>
                    <TableCell className="text-right">
                      {isLowStock ? (
                        <span className="inline-flex items-center rounded-md bg-destructive/10 px-2 py-1 text-xs font-medium text-destructive ring-1 ring-inset ring-destructive/20">
                          Low Stock
                        </span>
                      ) : (
                        <span className="inline-flex items-center rounded-md bg-emerald-500/10 px-2 py-1 text-xs font-medium text-emerald-600 ring-1 ring-inset ring-emerald-500/20">
                          Healthy
                        </span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger className="h-8 w-8 p-0 inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground">
                          <span className="sr-only">Open menu</span>
                          <MoreHorizontal className="h-4 w-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuGroup>
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuItem onClick={() => handleOpenModal(material)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem onClick={() => handleDelete(material.id, material.name)} className="text-destructive">
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuGroup>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
}
