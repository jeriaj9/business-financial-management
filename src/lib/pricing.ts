export interface GlobalSettings {
  laborCostPerHour: number;
  distributorMargin: number;
  promotionalDiscount: number;
  indirectCostReserve: number;
}

export interface Material {
  id: string;
  cost: number;
  [key: string]: any;
}

export interface ProductBomItem {
  materialId: string;
  quantity: number;
  [key: string]: any;
}

export interface Product {
  batchSize: number;
  productionTimeHours: number;
  targetMargin: number;
  bom?: ProductBomItem[];
  [key: string]: any;
}

export const calculateCosts = (
  product: Product | null | undefined, 
  availableMaterials: Material[], 
  globalSettings: GlobalSettings
) => {
  if (!product) {
    return {
      perUnitMaterialCost: 0,
      perUnitLaborCost: 0,
      indirectCost: 0,
      totalCost: 0,
      retailPrice: 0,
      distributorPrice: 0,
      promoPrice: 0,
      grossProfit: 0
    };
  }

  let rawMaterialCost = 0;
  if (product.bom) {
    product.bom.forEach((item) => {
      const material = availableMaterials.find(m => m.id === item.materialId);
      if (material) {
        rawMaterialCost += material.cost * item.quantity;
      }
    });
  }

  const perUnitMaterialCost = product.batchSize > 0 ? rawMaterialCost / product.batchSize : 0;
  
  // Labor Cost
  const totalLaborCost = (product.productionTimeHours || 0) * globalSettings.laborCostPerHour;
  const perUnitLaborCost = product.batchSize > 0 ? totalLaborCost / product.batchSize : 0;

  // Indirect Cost (Reserve)
  const baseCost = perUnitMaterialCost + perUnitLaborCost;
  const indirectCost = baseCost * globalSettings.indirectCostReserve;

  const totalCost = baseCost + indirectCost;

  // Pricing Engine
  const targetMargin = product.targetMargin || 0.50;
  const retailPrice = targetMargin < 1 ? totalCost / (1 - targetMargin) : totalCost * 2;
  const distributorPrice = retailPrice * (1 - globalSettings.distributorMargin);
  const promoPrice = retailPrice * (1 - globalSettings.promotionalDiscount);
  const grossProfit = retailPrice - totalCost;

  return {
    perUnitMaterialCost,
    perUnitLaborCost,
    indirectCost,
    totalCost,
    retailPrice,
    distributorPrice,
    promoPrice,
    grossProfit
  };
};
