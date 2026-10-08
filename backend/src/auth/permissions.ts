// Catálogo de permisos por acción y permisos iniciales por rol.
// Lo usan el seed (para poblar la BD) y el código (para referenciar códigos sin errores de tipeo).

export const PERMISSIONS = {
  // Usuarios y seguridad
  USERS_VIEW: 'users.view',
  USERS_MANAGE: 'users.manage',
  AUDIT_VIEW: 'audit.view',
  // Catálogos
  CATALOG_VIEW: 'catalog.view',
  CATALOG_MANAGE: 'catalog.manage',
  // Compras y lotes
  PURCHASES_VIEW: 'purchases.view',
  PURCHASES_CREATE: 'purchases.create',
  PURCHASES_ANNUL: 'purchases.annul',
  RECEPTIONS_CREATE: 'receptions.create',
  LOTS_VIEW: 'lots.view',
  LOT_OVERRIDE: 'lot.override',
  PRICE_CONFIGURE: 'price.configure',
  // Inventario
  INVENTORY_VIEW: 'inventory.view',
  INVENTORY_ADJUST: 'inventory.adjust',
  TRANSFERS_CREATE: 'transfers.create',
  TRANSFERS_RECEIVE: 'transfers.receive',
  // Clientes
  CUSTOMERS_VIEW: 'customers.view',
  CUSTOMERS_MANAGE: 'customers.manage',
  CUSTOMER_RANK_CHANGE: 'customer.rank_change',
  // Ventas
  SALES_VIEW: 'sales.view',
  SALES_CREATE: 'sales.create',
  SALES_ANNUL: 'sales.annul',
  SALES_RETURN: 'sales.return',
  PRICE_MODIFY: 'price.modify',
  CREDIT_EXCEPTION_AUTHORIZE: 'credit.exception_authorize',
  // Cobranza
  COLLECTIONS_VIEW: 'collections.view',
  COLLECTIONS_CREATE: 'collections.create',
  COLLECTIONS_ANNUL: 'collections.annul',
  // Preventas
  PRESALES_VIEW_OWN: 'presales.view_own',
  PRESALES_VIEW_ALL: 'presales.view_all',
  PRESALES_CREATE: 'presales.create',
  PRESALES_MANAGE: 'presales.manage',
  SYNC_PUSH: 'sync.push',
  // Logística
  ROUTES_VIEW: 'routes.view',
  ROUTES_MANAGE: 'routes.manage',
  DELIVERIES_REGISTER: 'deliveries.register',
  // Canastillos
  CRATES_VIEW: 'crates.view',
  CRATES_MANAGE: 'crates.manage',
  // Reportes
  REPORTS_VIEW: 'reports.view',
  REPORTS_FINANCIAL: 'reports.financial',
} as const;

export type PermissionCode = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_DESCRIPTIONS: Record<PermissionCode, string> = {
  'users.view': 'Ver usuarios',
  'users.manage': 'Crear y editar usuarios, roles y permisos',
  'audit.view': 'Ver bitácora de auditoría',
  'catalog.view': 'Ver productos, proveedores, sucursales y almacenes',
  'catalog.manage': 'Crear y editar productos, proveedores, sucursales y almacenes',
  'purchases.view': 'Ver compras',
  'purchases.create': 'Registrar compras',
  'purchases.annul': 'Anular compras',
  'receptions.create': 'Registrar recepción de compras',
  'lots.view': 'Ver lotes',
  'lot.override': 'Forzar salida de un lote no prioritario',
  'price.configure': 'Configurar precios por lote',
  'inventory.view': 'Ver stock y kardex',
  'inventory.adjust': 'Ajustar inventario y registrar bajas',
  'transfers.create': 'Enviar transferencias entre almacenes',
  'transfers.receive': 'Recibir transferencias en el almacén de destino',
  'customers.view': 'Ver clientes',
  'customers.manage': 'Crear y editar clientes',
  'customer.rank_change': 'Cambiar rango de cliente',
  'sales.view': 'Ver ventas',
  'sales.create': 'Registrar ventas',
  'sales.annul': 'Anular ventas',
  'sales.return': 'Autorizar devoluciones de clientes',
  'price.modify': 'Modificar precio final en una venta',
  'credit.exception_authorize': 'Autorizar ventas que superan el límite de crédito',
  'collections.view': 'Ver cobros de deuda',
  'collections.create': 'Registrar cobros de deuda',
  'collections.annul': 'Anular cobros de deuda',
  'presales.view_own': 'Ver preventas propias',
  'presales.view_all': 'Ver todas las preventas',
  'presales.create': 'Registrar preventas',
  'presales.manage': 'Confirmar, modificar o cancelar preventas',
  'sync.push': 'Sincronizar operaciones desde el móvil',
  'routes.view': 'Ver vehículos, rutas y entregas',
  'routes.manage': 'Gestionar vehículos; planificar, despachar y cerrar rutas',
  'deliveries.register': 'Registrar entregas en ruta',
  'crates.view': 'Ver canastillos por tenedor y sus movimientos',
  'crates.manage': 'Registrar altas, traspasos y bajas de canastillos',
  'reports.view': 'Ver reportes operativos y dashboard',
  'reports.financial': 'Ver reportes de rentabilidad y financieros',
};

const P = PERMISSIONS;

export const ROLE_DEFINITIONS: { code: string; name: string; permissions: PermissionCode[] | 'ALL' }[] = [
  { code: 'ADMIN', name: 'Administrador', permissions: 'ALL' },
  {
    code: 'SELLER_CENTRAL',
    name: 'Vendedor Central',
    permissions: [
      P.CATALOG_VIEW, P.LOTS_VIEW, P.INVENTORY_VIEW, P.TRANSFERS_CREATE, P.TRANSFERS_RECEIVE,
      P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE,
      P.SALES_VIEW, P.SALES_CREATE, P.PRESALES_VIEW_ALL,
      P.COLLECTIONS_VIEW, P.COLLECTIONS_CREATE, P.ROUTES_VIEW, P.ROUTES_MANAGE,
      P.CRATES_VIEW, P.CRATES_MANAGE,
    ],
  },
  {
    code: 'SELLER_BRANCH',
    name: 'Vendedor Sucursal',
    permissions: [
      P.CATALOG_VIEW, P.LOTS_VIEW, P.INVENTORY_VIEW, P.TRANSFERS_RECEIVE,
      P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE,
      P.SALES_VIEW, P.SALES_CREATE, P.PRICE_MODIFY,
      P.COLLECTIONS_VIEW, P.COLLECTIONS_CREATE, P.CRATES_VIEW,
    ],
  },
  {
    code: 'PRESELLER',
    name: 'Preventista',
    permissions: [
      P.CATALOG_VIEW, P.CUSTOMERS_VIEW, P.CUSTOMERS_MANAGE,
      P.PRESALES_VIEW_OWN, P.PRESALES_CREATE, P.SYNC_PUSH,
    ],
  },
  { code: 'DRIVER', name: 'Chofer', permissions: [P.CATALOG_VIEW, P.CUSTOMERS_VIEW, P.SYNC_PUSH, P.DELIVERIES_REGISTER] },
  { code: 'COLLECTOR', name: 'Cobrador', permissions: [P.CATALOG_VIEW, P.CUSTOMERS_VIEW, P.SYNC_PUSH, P.COLLECTIONS_VIEW, P.COLLECTIONS_CREATE] },
  {
    code: 'ACCOUNTANT',
    name: 'Contador',
    permissions: [
      P.PURCHASES_VIEW, P.SALES_VIEW, P.INVENTORY_VIEW, P.LOTS_VIEW,
      P.REPORTS_VIEW, P.REPORTS_FINANCIAL, P.AUDIT_VIEW, P.COLLECTIONS_VIEW, P.ROUTES_VIEW, P.CRATES_VIEW,
    ],
  },
];
