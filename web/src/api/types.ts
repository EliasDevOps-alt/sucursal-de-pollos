// Tipos de las respuestas de la API. Los decimales llegan como string (precisión exacta).
export type Dec = string;

export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  branchId: string | null;
  permissions: string[];
}

export interface Ref {
  id: string;
  code?: string;
  name: string;
}

export interface Category {
  id: string;
  code: string;
  name: string;
  description: string | null;
  isActive: boolean;
}

export interface Product {
  id: string;
  code: string;
  name: string;
  brand: string | null;
  categoryId: string;
  saleUnit: 'KG' | 'CANASTILLO' | 'UNIDAD';
  isActive: boolean;
  category: Ref;
}

export interface Supplier {
  id: string;
  name: string;
  taxId: string | null;
  phone: string | null;
  address: string | null;
  contactName: string | null;
  isActive: boolean;
}

export interface Warehouse {
  id: string;
  code: string;
  name: string;
  type: 'CENTRAL' | 'BRANCH';
  branch: Ref | null;
}

export type PurchaseStatus = 'REGISTERED' | 'RECEIVED' | 'CANCELLED';
export type ShrinkageTreatment = 'ABSORB' | 'INCORPORATE';

export interface PurchaseListItem {
  id: string;
  purchaseNumber: string;
  purchaseDate: string;
  paymentMethod: string;
  totalAmount: Dec;
  status: PurchaseStatus;
  supplier: Ref;
  warehouse: Ref;
  _count: { items: number };
}

export interface ReceptionItem {
  id: string;
  receivedWeightKg: Dec;
  canastilloWeightKg: Dec;
  netReceivedWeightKg: Dec;
  shrinkageWeightKg: Dec;
  shrinkagePercentage: Dec;
  expiryDate: string;
}

export interface PurchaseItem {
  id: string;
  productId: string;
  purchasedQuantity: Dec;
  purchasedWeightKg: Dec;
  unitCost: Dec;
  subtotal: Dec;
  product: Ref;
  receptionItem: ReceptionItem | null;
}

export interface PurchaseDetail extends Omit<PurchaseListItem, '_count'> {
  notes: string | null;
  createdAt: string;
  annulledAt: string | null;
  annulReason: string | null;
  createdBy: { fullName: string };
  annulledBy: { fullName: string } | null;
  items: PurchaseItem[];
  receptions: { id: string; receivedAt: string; receivedBy: { fullName: string } }[];
  lots: { id: string; lotCode: string; productId: string; actualCostPerKg: Dec; receivedWeightKg: Dec; expiryDate: string }[];
}

export interface LotPrice {
  id: string;
  pricePerKg: Dec;
  marginPercentage: Dec;
  isActive: boolean;
  createdAt: string;
  branch?: Ref | null;
  createdBy?: { fullName: string };
}

export interface LotListItem {
  id: string;
  lotCode: string;
  expiryDate: string;
  status: 'ACTIVE' | 'EXPIRED' | 'CLOSED' | 'CANCELLED';
  receivedWeightKg: Dec;
  originalCostPerKg: Dec;
  actualCostPerKg: Dec;
  shrinkageWeightKg: Dec;
  shrinkageTreatment: ShrinkageTreatment;
  product: Ref;
  purchase: { id: string; purchaseNumber: string; supplier: { name: string } };
  availableWeightKg: Dec;
  availableQuantity: Dec;
  currentPrice: LotPrice | null;
  daysToExpiry: number;
}

export interface KardexRow {
  id: string;
  movementType: string;
  weightKg: Dec;
  quantity: Dec;
  unitCostPerKg: Dec;
  movementDate: string;
  referenceType: string;
  reason: string | null;
  balanceWeightKg: Dec;
  warehouse: { code: string; name: string };
  createdBy: { fullName: string };
}

export interface LotDetail {
  id: string;
  lotCode: string;
  expiryDate: string;
  status: string;
  receivedWeightKg: Dec;
  receivedQuantity: Dec;
  originalCostTotal: Dec;
  originalCostPerKg: Dec;
  actualCostPerKg: Dec;
  shrinkageWeightKg: Dec;
  shrinkageLossAmount: Dec;
  shrinkageTreatment: ShrinkageTreatment;
  availableWeightKg: Dec;
  daysToExpiry: number;
  product: Product;
  purchase: { id: string; purchaseNumber: string; purchaseDate: string; supplier: Ref };
  reception: { receivedAt: string; receivedBy: { fullName: string } };
  receptionItem: ReceptionItem & { qualityNotes: string | null; expirySource: string };
  warehouse: Ref;
  inventoryMovements: KardexRow[];
  prices: LotPrice[];
}
