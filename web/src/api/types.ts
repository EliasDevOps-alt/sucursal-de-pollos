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
  /** Si tiene valor, se vende también por canastillo (peso aproximado de uno lleno). */
  kgPerCrate: Dec | null;
  minStockKg: Dec;
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
  paidAt: string | null;
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
  branchId?: string | null;
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
  /** Compra promedio mensual (90 días) para sugerir el ascenso a este rango. */
  minMonthlyPurchase: Dec;
  /** Antigüedad máxima de la deuda para sugerirlo. */
  maxDaysOverdue: number;
}

export interface RankSuggestion {
  customer: { id: string; code: string; name: string };
  currentRank: { id: string; name: string } | null;
  suggestedRank: { id: string; name: string; discountPercentage: Dec; creditLimit: Dec; minMonthlyPurchase: Dec };
  monthlyAverage: Dec;
  sales: number;
  oldestDebtDays: number | null;
  currentCreditLimit: Dec;
  reason: string;
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
  cratesHeld: number;
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
  returnedAmount: Dec;
  returns: SaleReturn[];
  items: {
    id: string;
    product: Ref;
    requestedWeightKg: Dec;
    crates: number;
    returnedWeightKg: Dec;
    returnedAmount: Dec;
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
      returnedWeightKg: Dec;
      restockedWeightKg: Dec;
    }[];
  }[];
  profitability: { revenue: Dec; cost: Dec; margin: Dec; marginPercentage: Dec };
}

export interface SaleReturn {
  id: string;
  returnNumber: string;
  createdAt: string;
  reason: string;
  refundMethod: 'CREDIT' | 'CASH';
  totalAmount: Dec;
  restockedKg: Dec;
  discardedKg: Dec;
  lossAmount: Dec;
  sale: { id: string; saleNumber: string };
  customer: Ref | null;
  warehouse: Ref;
  authorizedBy: { fullName: string };
  createdBy: { fullName: string };
  items: { id: string; saleItemId: string; weightKg: Dec; amount: Dec; costPerKg: Dec; disposition: 'RESTOCK' | 'DISCARD'; product: Ref; lot: { id: string; lotCode: string } }[];
}

// ── Inventario ─────────────────────────────────────────────
export interface LotBalance {
  lotId: string;
  lotCode: string;
  product: Ref;
  expiryDate: string;
  expired: boolean;
  weightKg: Dec;
  costPerKg: Dec;
  value: Dec;
}

export type TransferStatus = 'IN_TRANSIT' | 'RECEIVED' | 'CANCELLED';
export interface Transfer {
  id: string;
  transferNumber: string;
  status: TransferStatus;
  notes: string | null;
  sentAt: string;
  receivedAt: string | null;
  receiveNotes: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  origin: { id: string; code: string; name: string; branchId: string | null };
  destination: { id: string; code: string; name: string; branchId: string | null; branch: { name: string; transferWeighingEnabled: boolean } | null };
  sentBy: { fullName: string };
  receivedBy: { fullName: string } | null;
  cancelledBy: { fullName: string } | null;
  items: {
    id: string;
    product: Ref;
    lot: { id: string; lotCode: string; expiryDate: string };
    sentWeightKg: Dec;
    receivedWeightKg: Dec | null;
    differenceKg: Dec;
    costPerKg: Dec;
    lossAmount: Dec;
  }[];
}

export type AdjustmentKind = 'COUNT' | 'LOSS';
export interface Adjustment {
  id: string;
  adjustmentNumber: string;
  kind: AdjustmentKind;
  reasonCode: string;
  systemWeightKg: Dec;
  newWeightKg: Dec;
  weightKg: Dec;
  costPerKg: Dec;
  amount: Dec;
  notes: string;
  status: 'VALID' | 'ANNULLED';
  createdAt: string;
  annulledAt: string | null;
  annulReason: string | null;
  warehouse: { id: string; code: string; name: string };
  product: Ref;
  lot: { id: string; lotCode: string; expiryDate: string };
  createdBy: { fullName: string };
  annulledBy: { fullName: string } | null;
}

export interface StockRow {
  product: { id: string; code: string; name: string; category: { name: string } };
  weightKg: Dec;
  value: Dec;
  lots: number;
  nextExpiry: string | null;
}

// ── Reportes ───────────────────────────────────────────────
export interface DayPoint {
  day: string;
  revenue: Dec;
  cost?: Dec;
  margin?: Dec;
  count: number;
  kg: Dec;
}

export interface Alerts {
  today: string;
  expiringLots: { id: string; lotCode: string; product: string; warehouse: string; expiryDate: string; daysToExpiry: number; weightKg: Dec; costValue: Dec }[];
  lowStock: { id: string; code: string; name: string; minStockKg: Dec; stockKg: Dec }[];
}

export interface Debtor {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  debt: Dec;
  creditLimit: Dec;
  usagePercentage: Dec;
  oldestCharge: string | null;
  daysOutstanding: number | null;
}

export interface Dashboard {
  range: { from: string; to: string };
  previousRange: { from: string; to: string };
  kpis: {
    revenue: Dec;
    revenueDeltaPercentage: Dec | null;
    salesCount: number;
    averageTicket: Dec;
    kgSold: Dec;
    cost?: Dec;
    margin?: Dec;
    marginPercentage?: Dec;
    marginDeltaPercentage?: Dec | null;
    receivables: Dec;
    debtors: number;
    stockKg: Dec;
    stockValue?: Dec;
    purchasesTotal: Dec;
    purchasesCount: number;
  };
  salesByDay: DayPoint[];
  topProducts: { id: string; label: string; kg: Dec; revenue: Dec; margin?: Dec; marginPercentage?: Dec }[];
  alerts: Alerts;
  topDebtors: Debtor[];
  /** Operación de hoy: cada bloque llega solo si el usuario tiene el permiso correspondiente. */
  today: {
    date: string;
    routes?: { routes: number; inProgress: number; planned: number; stops: number; delivered: number; failed: number; pending: number; collected: Dec };
    crates?: { withCustomers: number; customersHolding: number; withPeople: number };
    money?: { cashOnHand: Dec; inBank: Dec; pendingSettlement: { cash: Dec; digital: Dec; people: number }; supplierPayables: { amount: Dec; count: number } };
  };
}

export interface ProfitRow {
  id: string | null;
  label: string;
  detail: string | null;
  kg: Dec;
  sales: number;
  revenue: Dec;
  cost: Dec;
  margin: Dec;
  marginPercentage: Dec;
}

export interface Profitability {
  range: { from: string; to: string };
  groupBy: 'product' | 'lot' | 'customer' | 'seller';
  totals: { revenue: Dec; cost: Dec; margin: Dec; marginPercentage: Dec; kg: Dec };
  rows: ProfitRow[];
}

export interface ShrinkageReport {
  inventoryLosses: {
    totals: { lossKg: Dec; lossAmount: Dec; surplusKg: Dec; surplusAmount: Dec };
    byCause: { cause: string; kg: Dec; amount: Dec; count: number }[];
    events: { id: string; at: string; cause: string; document: string; kind: 'adjustment' | 'transfer' | 'return'; referenceId: string; product: string; lotCode: string; warehouse: string; kg: Dec; amount: Dec; notes: string | null }[];
  };
  totals: { purchasedKg: Dec; shrinkageKg: Dec; shrinkagePercentage: Dec; loss: Dec };
  bySupplier: { supplierId: string; supplier: string; lots: number; purchasedKg: Dec; shrinkageKg: Dec; shrinkagePercentage: Dec; loss: Dec }[];
  lots: { id: string; lotCode: string; product: string; supplier: string; receivedAt: string; purchasedKg: Dec; netKg: Dec; shrinkageKg: Dec; shrinkagePercentage: Dec; loss: Dec; treatment: string }[];
}

export interface ReceivablesReport {
  total: Dec;
  debtors: number;
  buckets: { label: string; amount: Dec }[];
  customers: Debtor[];
}

// ── Preventas ──────────────────────────────────────────────
export type PresaleStatus = 'PENDING' | 'CONFIRMED' | 'ASSIGNED' | 'DELIVERED' | 'CANCELLED';

export interface PresaleListItem {
  id: string;
  presaleNumber: string;
  status: PresaleStatus;
  totalAmount: Dec;
  scheduledDeliveryDate: string | null;
  createdOffline: boolean;
  createdAtDevice: string | null;
  createdAt: string;
  customer: { id: string; code: string; name: string };
  preventista: { id: string; fullName: string };
  sale: { id: string; saleNumber: string } | null;
  _count: { items: number };
}

export interface PresaleDetail extends Omit<PresaleListItem, '_count' | 'sale'> {
  notes: string | null;
  latitude: Dec | null;
  longitude: Dec | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  customer: { id: string; code: string; name: string; phone: string | null; creditEnabled: boolean };
  address: CustomerAddress | null;
  sale: { id: string; saleNumber: string; totalAmount: Dec } | null;
  items: { id: string; productId: string; weightKg: Dec; quantity: Dec; crates: number; unitPrice: Dec; subtotal: Dec; notes: string | null; product: Ref }[];
}

// ── Cobranza ───────────────────────────────────────────────
export interface Collection {
  id: string;
  receiptNumber: string;
  amount: Dec;
  paymentMethod: string;
  paymentSource: string;
  paymentDate: string;
  referenceNumber: string | null;
  notes: string | null;
  isAdvance: boolean;
  status: 'VALID' | 'ANNULLED';
  annulledAt: string | null;
  annulReason: string | null;
  annulledBy: { fullName: string } | null;
  customer: { id: string; code: string; name: string; currentDebt: Dec };
  receivedBy: { id: string; fullName: string };
  paidByName: string | null;
  signature?: string | null;
  latitude: Dec | null;
  longitude: Dec | null;
  collectedAtDevice: string | null;
}

export interface PendingCustomer {
  id: string;
  code: string;
  name: string;
  phone: string | null;
  debt: Dec;
  creditLimit: Dec;
  crates: number;
  address: string | null;
  latitude: Dec | null;
  longitude: Dec | null;
  daysOutstanding: number | null;
  lastPayment: string | null;
}

// ── Canastillos ────────────────────────────────────────────
export type CrateHolderType = 'WAREHOUSE' | 'CUSTOMER' | 'USER';
export interface CrateHolder {
  holderType: CrateHolderType;
  holderId: string;
  quantity: number;
  name: string;
  kind: string;
}
export interface CrateBalances {
  total: number;
  inWarehouses: number;
  inVehicles: number;
  withCustomers: number;
  withPeople: number;
  holders: CrateHolder[];
}
export interface CrateMovement {
  id: string;
  type: string;
  quantity: number;
  reason: string | null;
  chargeAmount: Dec | null;
  referenceType: string | null;
  referenceId: string | null;
  createdAt: string;
  createdBy: { fullName: string };
  from: { type: CrateHolderType; id: string; name: string; kind: string } | null;
  to: { type: CrateHolderType; id: string; name: string; kind: string } | null;
}

// ── Administración ─────────────────────────────────────────
export interface UserRow {
  id: string;
  username: string;
  fullName: string;
  phone: string | null;
  email: string | null;
  isActive: boolean;
  createdAt: string;
  role: { id: string; code: string; name: string };
  branch: { id: string; code: string; name: string } | null;
}

export interface RoleRow {
  id: string;
  code: string;
  name: string;
  users: number;
  permissions: string[];
}

export interface PermissionRow {
  id: string;
  code: string;
  module: string;
  description: string;
}

export interface AuditLogRow {
  id: string;
  action: string;
  entityType: string;
  entityId: string | null;
  oldData: unknown;
  newData: unknown;
  reason: string | null;
  createdAt: string;
  user: { id: string; fullName: string; username: string } | null;
}

export interface SyncIssue {
  id: string;
  deviceOperationId: string;
  operationType: string;
  entityType: string;
  payload: Record<string, unknown>;
  status: 'ERROR' | 'REVIEW';
  errorMessage: string | null;
  createdAtDevice: string;
  receivedAtServer: string;
  resolvedAt: string | null;
  resolutionNote: string | null;
  user: { id: string; fullName: string };
  device: { deviceUuid: string; platform: string; appVersion: string | null };
  resolvedBy: { fullName: string } | null;
}

export interface Branch {
  id: string;
  code: string;
  name: string;
}

// ── Logística ──────────────────────────────────────────────
export interface Vehicle {
  id: string;
  plate: string;
  description: string;
  ownership: 'OWN' | 'SUBCONTRACTED';
  ownerName: string | null;
  capacityKg: Dec;
  capacityCrates: number;
  warehouseId: string;
  isActive: boolean;
  activeRoutes?: { id: string; routeNumber: string; routeDate: string; status: RouteStatus }[];
}

export type RouteStatus = 'PLANNED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
export type StopStatus = 'PENDING' | 'DELIVERED' | 'PARTIAL' | 'FAILED';

export interface RouteSummary {
  crates?: { loaded: number; delivered: number; pickedUp: number; expectedBack: number; returned: number | null };
  stops: number;
  delivered: number;
  failed: number;
  pending?: number;
  orderedKg: Dec;
  estimatedCrates?: number;
  orderedAmount: Dec;
  soldAmount?: Dec;
  collectedAmount?: Dec;
  creditAmount?: Dec;
}

export interface RouteListItem {
  id: string;
  routeNumber: string;
  routeDate: string;
  status: RouteStatus;
  notes: string | null;
  vehicle: { id: string; plate: string; description: string };
  driver: { id: string; fullName: string };
  summary: RouteSummary;
}

export interface RouteStop {
  id: string;
  sequence: number;
  status: StopStatus;
  presaleId: string;
  customer: { id: string; code: string; name: string; phone: string | null; creditEnabled: boolean; creditLimit: Dec; currentDebt: Dec };
  address: { id: string; label: string; address: string; latitude: Dec | null; longitude: Dec | null } | null;
  presale: { id: string; presaleNumber: string; totalAmount: Dec; notes: string | null; preventista: { fullName: string } };
  sale: { id: string; saleNumber: string; totalAmount: Dec; paidAmount: Dec; creditAmount: Dec; paymentStatus: string; creditExceptionReason: string | null } | null;
  creditAuthorizedBy: { fullName: string } | null;
  creditAuthReason: string | null;
  receivedByName: string | null;
  signature: string | null;
  cratesDelivered: number;
  cratesPickedUp: number;
  paidAmount: Dec;
  paymentMethod: string | null;
  problemType: string | null;
  notes: string | null;
  latitude: Dec | null;
  longitude: Dec | null;
  resolvedAtDevice: string | null;
  recordedBy: { fullName: string } | null;
  items: { id: string; product: Ref; orderedWeightKg: Dec; deliveredWeightKg: Dec | null; differenceReason: string | null }[];
}

export interface LoadSheetRow {
  productId: string;
  name: string;
  orderedKg: Dec;
  loadedKg: Dec;
  deliveredKg: Dec;
  returnedKg: Dec;
  lossKg: Dec;
  onBoardKg: Dec;
}

export interface RouteDetail extends Omit<RouteListItem, 'summary' | 'vehicle'> {
  vehicle: Vehicle;
  originWarehouse: { id: string; code: string; name: string };
  createdBy: { fullName: string };
  dispatchedBy: { fullName: string } | null;
  dispatchedAt: string | null;
  closedBy: { fullName: string } | null;
  closedAt: string | null;
  closeNotes: string | null;
  cratesLoaded: number;
  cratesReturned: number | null;
  cancelledBy: { fullName: string } | null;
  cancelReason: string | null;
  createdAt: string;
  stops: RouteStop[];
  loadSheet: LoadSheetRow[];
  summary: Required<RouteSummary>;
}

export interface RouteCandidate {
  id: string;
  presaleNumber: string;
  scheduledDeliveryDate: string | null;
  totalAmount: Dec;
  notes: string | null;
  customer: { id: string; code: string; name: string };
  address: { label: string; address: string; latitude: Dec | null; longitude: Dec | null } | null;
  preventista: { fullName: string };
  weightKg: Dec;
  items: { productId: string; productName: string; weightKg: Dec }[];
  creditAvailable: Dec;
  creditWouldExceed: boolean;
}

// ── Finanzas ───────────────────────────────────────────────
export interface CashSessionRow {
  id: string;
  sessionNumber: string;
  status: 'OPEN' | 'CLOSED';
  openedAt: string;
  openingExpected: Dec;
  openingCounted: Dec;
  closedAt: string | null;
  closingExpected: Dec | null;
  closingCounted: Dec | null;
  closingDifference: Dec | null;
  denominations: Record<string, number> | null;
  notes: string | null;
  cashAccount: { code: string; name: string };
  openedBy: { fullName: string };
  closedBy: { fullName: string } | null;
}
export interface CashAccountRow {
  id: string;
  code: string;
  name: string;
  type: 'CASH' | 'BANK';
  balance: Dec;
  branch: { id: string; name: string } | null;
  openSession: (Omit<CashSessionRow, 'cashAccount' | 'closedBy'> & { openedBy: { fullName: string } }) | null;
}
export interface CashMovementRow {
  id: string;
  direction: 'IN' | 'OUT';
  category: string;
  expenseType: string | null;
  amount: Dec;
  balanceAfter: Dec;
  paymentMethod: string | null;
  description: string;
  referenceType: string | null;
  referenceId: string | null;
  reversedById: string | null;
  sessionId: string | null;
  createdAt: string;
  cashAccount: { code: string; name: string; type: 'CASH' | 'BANK' };
  createdBy: { fullName: string };
}
export interface CashSummary {
  accounts: CashAccountRow[];
  cashOnHand: Dec;
  inBank: Dec;
  pendingSettlement: { cash: Dec; digital: Dec; people: number };
  supplierPayables: { amount: Dec; count: number };
  period: { from: string; to: string; income: Dec; expense: Dec; rows: { direction: 'IN' | 'OUT'; category: string; expenseType: string | null; amount: Dec; count: number }[] };
}
export interface SessionDetail extends CashSessionRow {
  movements: (CashMovementRow & { cashAccount?: undefined })[];
  byCategory: { category: string; direction: 'IN' | 'OUT'; amount: Dec; count: number }[];
  totals: { in: Dec; out: Dec };
}
export interface PendingSettlement {
  user: { id: string; fullName: string; role: string };
  cash: Dec;
  digital: Dec;
  count: number;
  since: string;
  payments: { id: string; amount: Dec; paymentMethod: string; paymentDate: string; receiptNumber: string | null; referenceNumber: string | null; customer: { name: string } | null; sale: { saleNumber: string } | null }[];
}
export interface SettlementRow {
  id: string;
  settlementNumber: string;
  expectedCash: Dec;
  countedCash: Dec;
  cashDifference: Dec;
  digitalAmount: Dec;
  paymentsCount: number;
  notes: string | null;
  createdAt: string;
  user: { fullName: string };
  receivedBy: { fullName: string };
  cashAccount: { name: string };
  payments?: PendingSettlement['payments'];
}

// ── Comprobantes (fase L) ──────────────────────────────────

export type ReceiptSlug = 'venta' | 'entrega' | 'cobro' | 'rendicion' | 'caja';

export interface CompanyInfo {
  name: string;
  nit: string;
  address: string;
  phone: string;
  footer: string;
}

export interface Receipt {
  type: 'SALE' | 'DELIVERY' | 'COLLECTION' | 'SETTLEMENT' | 'CASH_SESSION';
  documentId: string;
  number: string;
  title: string;
  issuedAt: string;
  company: CompanyInfo;
  meta: { label: string; value: string }[];
  items: { description: string; detail?: string; amount?: string }[];
  totals: { label: string; value: string; strong?: boolean }[];
  extra: { label: string; value: string }[];
  signature?: string | null;
  signatureLabel?: string;
  notice?: string;
  footer: string;
  printCount: number;
  copyNumber?: number;
}

export interface ReceiptPrintRow {
  id: string;
  documentType: Receipt['type'];
  documentId: string;
  documentNumber: string;
  copyNumber: number;
  channel: 'WEB' | 'BLUETOOTH';
  printedAt: string;
  printedBy: { fullName: string };
}

// ── Reportes de la operación (fase M) ──────────────────────

export interface SalesFilterValues {
  branchId?: string;
  categoryId?: string;
  sellerId?: string;
  customerId?: string;
}

export interface ReportOptions {
  branches: { id: string; name: string }[];
  categories: { id: string; name: string }[];
  sellers: { id: string; name: string }[];
  drivers: { id: string; name: string }[];
  vehicles: { id: string; plate: string; description: string }[];
  suppliers: { id: string; name: string }[];
  customerTypes: { id: string; name: string }[];
  customers: { id: string; name: string; code: string }[];
}

export interface LogisticsFigures {
  routes: number;
  stops: number;
  delivered: number;
  partial: number;
  failed: number;
  pending: number;
  deliveryRate: Dec | null;
  orderedKg: Dec;
  deliveredKg: Dec;
  soldAmount: Dec;
  collected: Dec;
  credit: Dec;
}

export interface LogisticsReport {
  range: { from: string; to: string };
  totals: LogisticsFigures & { cratesDelivered: number; cratesPickedUp: number };
  byDriver: (LogisticsFigures & { id: string; name: string })[];
  byVehicle: (LogisticsFigures & { id: string; plate: string })[];
  byDay: (LogisticsFigures & { day: string })[];
  problems: { problemType: string; count: number }[];
}

export interface CratesReport {
  range: { from: string; to: string };
  totals: { total: number; inWarehouses: number; inVehicles: number; withCustomers: number; withPeople: number; customersHolding: number; writtenOff: number; charged: Dec; shortages: number };
  movements: { type: string; count: number; quantity: number; charged: Dec }[];
  customers: { id: string; code: string; name: string; quantity: number; lastMovement: string | null; daysSinceMovement: number | null }[];
  people: { id: string; name: string; role: string; quantity: number }[];
}

export interface BranchRow {
  id: string;
  name: string;
  salesCount: number;
  revenue: Dec;
  cost: Dec;
  margin: Dec;
  marginPercentage: Dec;
  kgSold: Dec;
  credit: Dec;
  transfersReceived: number;
  transferredKg: Dec;
  transitLossKg: Dec;
  transitLoss: Dec;
  lossKg: Dec;
  lossAmount: Dec;
  stockKg: Dec;
  stockValue: Dec;
}

export interface BranchesReport {
  range: { from: string; to: string };
  totals: { revenue: Dec; margin: Dec; kgSold: Dec; stockKg: Dec };
  rows: BranchRow[];
}

export interface PurchasesReport {
  range: { from: string; to: string };
  totals: { purchases: number; kg: Dec; amount: Dec; costPerKg: Dec; unpaid: Dec };
  bySupplier: { id: string; name: string; purchases: number; kg: Dec; amount: Dec; costPerKg: Dec; shrinkagePercentage: Dec | null; unpaid: Dec; unpaidCount: number }[];
  byProduct: { id: string; name: string; kg: Dec; amount: Dec; costPerKg: Dec; minCostPerKg: Dec; maxCostPerKg: Dec }[];
  byDay: { day: string; amount: Dec; kg: Dec }[];
}

export interface CustomersReport {
  range: { from: string; to: string };
  totals: { active: number; newCustomers: number; lapsed: number; revenue: Dec; top5Percentage: Dec; walkInSales: number; walkInRevenue: Dec };
  byType: { id: string; name: string; customers: number; revenue: Dec }[];
  customers: { id: string; code: string; name: string; type: string; sales: number; revenue: Dec; kg: Dec; averageTicket: Dec; lastSale: string | null; debt: Dec; crates: number }[];
  lapsed: { id: string; code: string; name: string; phone: string | null; lastSale: string; previousRevenue: Dec }[];
}
