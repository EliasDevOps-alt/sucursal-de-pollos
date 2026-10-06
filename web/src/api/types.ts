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

// ── Clientes ───────────────────────────────────────────────
export interface CustomerRank {
  id: string;
  code: string;
  name: string;
  discountPercentage: Dec;
  creditLimit: Dec;
}

export interface CustomerAddress {
  id: string;
  label: string;
  address: string;
  latitude: Dec | null;
  longitude: Dec | null;
  isPrimary: boolean;
  source: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  documentId: string | null;
  phone: string | null;
  customerTypeId: string;
  rankId: string | null;
  creditEnabled: boolean;
  creditLimit: Dec;
  currentDebt: Dec;
  creditAvailable: Dec;
  status: 'ACTIVE' | 'INACTIVE';
  customerType: { id: string; name: string };
  rank: (Pick<CustomerRank, 'id' | 'code' | 'name' | 'discountPercentage'>) | null;
  addresses: CustomerAddress[];
}

export interface ReceivableMovement {
  id: string;
  movementType: 'CHARGE' | 'PAYMENT' | 'ANNUL' | 'ADJUSTMENT';
  amount: Dec;
  balanceAfter: Dec;
  referenceType: string;
  referenceId: string;
  reason: string | null;
  createdAt: string;
  createdBy: { fullName: string };
}

export interface CustomerDetail extends Customer {
  sales: { id: string; saleNumber: string; createdAt: string; totalAmount: Dec; paymentStatus: PaymentStatus; status: SaleStatus }[];
  receivableMovements: ReceivableMovement[];
}

// ── Ventas ─────────────────────────────────────────────────
export type PaymentStatus = 'PAID' | 'PARTIAL' | 'CREDIT' | 'PENDING';
export type SaleStatus = 'CONFIRMED' | 'ANNULLED' | 'RETURNED';

export interface AvailableLot {
  lotId: string;
  lotCode: string;
  expiryDate: string;
  availableKg: Dec;
  costPerKg: Dec;
  pricePerKg: Dec | null;
  fefoOrder: number;
}

export interface SaleIssue {
  type: 'LOT_OVERRIDE' | 'PRICE_CHANGE' | 'CREDIT_LIMIT';
  lineIndex?: number;
  message: string;
  permission: string;
  reason?: string;
  approver?: { id: string; fullName: string };
  needsReason: boolean;
}

export interface SaleQuote {
  saleMode: 'CENTRAL' | 'BRANCH' | 'PRESALE';
  customer: { id: string; name: string; rank: string | null; creditEnabled: boolean; creditAvailable: Dec } | null;
  discountPercentage: Dec;
  lines: {
    productId: string;
    productName: string;
    weightKg: Dec;
    originalUnitPrice: Dec;
    unitPrice: Dec;
    gross: Dec;
    discount: Dec;
    subtotal: Dec;
    cost: Dec;
    allocations: { lotId: string; lotCode: string; expiryDate: string; weightKg: Dec; costPerKg: Dec; price: Dec; forced: boolean }[];
  }[];
  subtotal: Dec;
  discount: Dec;
  total: Dec;
  cost: Dec;
  paid: Dec;
  credit: Dec;
  paymentStatus: PaymentStatus;
  issues: SaleIssue[];
  canConfirm: boolean;
}

export interface SaleListItem {
  id: string;
  saleNumber: string;
  createdAt: string;
  saleMode: string;
  totalAmount: Dec;
  paidAmount: Dec;
  creditAmount: Dec;
  paymentStatus: PaymentStatus;
  status: SaleStatus;
  customer: { id: string; code: string; name: string } | null;
  warehouse: Ref;
  seller: { id: string; fullName: string };
  _count: { items: number };
}

export interface SaleDetail extends Omit<SaleListItem, '_count'> {
  subtotal: Dec;
  discountAmount: Dec;
  notes: string | null;
  annulledAt: string | null;
  annulReason: string | null;
  annulledBy: { fullName: string } | null;
  creditAuthorizedBy: { fullName: string } | null;
  creditExceptionReason: string | null;
  branch: Ref | null;
  payments: { id: string; amount: Dec; paymentMethod: string; paymentDate: string; receivedBy: { fullName: string } }[];
  items: {
    id: string;
    product: Ref;
    requestedWeightKg: Dec;
    originalUnitPrice: Dec;
    unitPrice: Dec;
    discountAmount: Dec;
    subtotal: Dec;
    priceChangeReason: string | null;
    priceAuthorizedBy: { fullName: string } | null;
    cost: Dec;
    margin: Dec;
    allocations: {
      id: string;
      weightKg: Dec;
      costPerKg: Dec;
      salePricePerKg: Dec;
      forcedLot: boolean;
      forceReason: string | null;
      authorizedBy: { fullName: string } | null;
      lot: { id: string; lotCode: string; expiryDate: string };
    }[];
  }[];
  profitability: { revenue: Dec; cost: Dec; margin: Dec; marginPercentage: Dec };
}

// ── Inventario ─────────────────────────────────────────────
export interface StockRow {
  product: { id: string; code: string; name: string; category: { name: string } };
  weightKg: Dec;
  value: Dec;
  lots: number;
  nextExpiry: string | null;
}
