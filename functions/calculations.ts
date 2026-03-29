/**
 * Funciones de cálculo comunes para el ERP
 */

// Cálculo básico del impuesto (ej. IGV/IVA a 18%)
export function calculateTax(amount: number, taxRate: number = 0.18): number {
  return Number((amount * taxRate).toFixed(2));
}

// Total de la operación
export function calculateTotal(subtotal: number, tax: number): number {
  return Number((subtotal + tax).toFixed(2));
}

// Cálculo de la detracción si el servicio o venta lo requiere
export function calculateDetraction(total: number, detractionRatePercentage: number): number {
  return Number((total * (detractionRatePercentage / 100)).toFixed(2));
}

// Cálculo del nuevo stock disponible en inventario tras un movimiento
export function calculateNewStock(currentStock: number, movementQuantity: number, isEntry: boolean): number {
  const result = isEntry ? currentStock + movementQuantity : currentStock - movementQuantity;
  return Number(result.toFixed(2));
}

// Cálculo simple del margen de ganancia de un servicio
export function calculateServiceMargin(basePrice: number, totalCosts: number): number {
  const margin = basePrice - totalCosts;
  return Number(margin.toFixed(2));
}
