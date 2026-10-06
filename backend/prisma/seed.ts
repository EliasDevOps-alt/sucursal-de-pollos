// Datos iniciales: permisos, roles, usuarios de demo y catálogos básicos.
// Es idempotente (upsert): se puede ejecutar varias veces sin duplicar registros.
import { PrismaClient, SaleUnit, WarehouseType } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { PERMISSION_DESCRIPTIONS, PermissionCode, ROLE_DEFINITIONS } from '../src/auth/permissions';

const prisma = new PrismaClient();

async function seedSecurity() {
  const codes = Object.keys(PERMISSION_DESCRIPTIONS) as PermissionCode[];
  for (const code of codes) {
    await prisma.permission.upsert({
      where: { code },
      update: { description: PERMISSION_DESCRIPTIONS[code], module: code.split('.')[0] },
      create: { code, description: PERMISSION_DESCRIPTIONS[code], module: code.split('.')[0] },
    });
  }

  const allPermissions = await prisma.permission.findMany();
  for (const def of ROLE_DEFINITIONS) {
    const role = await prisma.role.upsert({
      where: { code: def.code },
      update: { name: def.name },
      create: { code: def.code, name: def.name },
    });
    const wanted = def.permissions === 'ALL' ? codes : def.permissions;
    const permissionIds = allPermissions.filter((p) => wanted.includes(p.code as PermissionCode)).map((p) => p.id);

    // Sincroniza los permisos del rol con la definición.
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: permissionIds.map((permissionId) => ({ roleId: role.id, permissionId })),
    });
  }
}

async function seedOrganization() {
  const central = await prisma.branch.upsert({
    where: { code: 'CEN' },
    update: {},
    create: { code: 'CEN', name: 'Central', address: 'Av. Principal #100' },
  });
  const branch1 = await prisma.branch.upsert({
    where: { code: 'SUC1' },
    update: {},
    create: { code: 'SUC1', name: 'Sucursal Mercado Norte', address: 'Mercado Norte, puesto 12', priceEditEnabled: true },
  });

  await prisma.warehouse.upsert({
    where: { code: 'ALM-CEN' },
    update: {},
    create: { code: 'ALM-CEN', name: 'Almacén Central', type: WarehouseType.CENTRAL, branchId: central.id },
  });
  await prisma.warehouse.upsert({
    where: { code: 'ALM-SUC1' },
    update: {},
    create: { code: 'ALM-SUC1', name: 'Almacén Sucursal Mercado Norte', type: WarehouseType.BRANCH, branchId: branch1.id },
  });

  return { central, branch1 };
}

async function seedUsers(branch1Id: string) {
  const roles = Object.fromEntries((await prisma.role.findMany()).map((r) => [r.code, r.id]));
  const users = [
    { username: 'admin', password: 'Admin123!', fullName: 'Administrador General', role: 'ADMIN' },
    { username: 'vcentral', password: 'Demo123!', fullName: 'Vendedor Central Demo', role: 'SELLER_CENTRAL' },
    { username: 'vsucursal', password: 'Demo123!', fullName: 'Vendedor Sucursal Demo', role: 'SELLER_BRANCH', branchId: branch1Id },
    { username: 'preventista', password: 'Demo123!', fullName: 'Preventista Demo', role: 'PRESELLER' },
    { username: 'contador', password: 'Demo123!', fullName: 'Contador Demo', role: 'ACCOUNTANT' },
  ];

  for (const u of users) {
    await prisma.user.upsert({
      where: { username: u.username },
      update: {},
      create: {
        username: u.username,
        passwordHash: await bcrypt.hash(u.password, 10),
        fullName: u.fullName,
        roleId: roles[u.role],
        branchId: u.branchId,
      },
    });
  }
}

async function seedCatalogs() {
  const categories = [
    { code: 'ENT', name: 'Pollo entero' },
    { code: 'DES', name: 'Despiece' },
    { code: 'MEN', name: 'Menudencia' },
  ];
  for (const c of categories) {
    await prisma.productCategory.upsert({ where: { code: c.code }, update: {}, create: c });
  }
  const cat = Object.fromEntries((await prisma.productCategory.findMany()).map((c) => [c.code, c.id]));

  const products = [
    { code: 'PE-SOF', name: 'Pollo entero SOFIA', brand: 'SOFIA', category: 'ENT', minStockKg: 150 },
    { code: 'PE-PIO', name: 'Pollo entero PÍO', brand: 'PÍO', category: 'ENT', minStockKg: 150 },
    { code: 'PE-GRA', name: 'Pollo entero granja', brand: null, category: 'ENT', minStockKg: 100 },
    { code: 'DE-PEC', name: 'Pechuga', brand: null, category: 'DES', minStockKg: 40 },
    { code: 'DE-PIE', name: 'Pierna', brand: null, category: 'DES', minStockKg: 40 },
    { code: 'DE-ALA', name: 'Ala', brand: null, category: 'DES', minStockKg: 30 },
    { code: 'ME-HIG', name: 'Hígado', brand: null, category: 'MEN', minStockKg: 10 },
  ];
  for (const p of products) {
    await prisma.product.upsert({
      where: { code: p.code },
      update: { minStockKg: p.minStockKg },
      create: { code: p.code, name: p.name, brand: p.brand, categoryId: cat[p.category], saleUnit: SaleUnit.KG, minStockKg: p.minStockKg },
    });
  }

  const customerTypes = ['Tienda', 'Mercado', 'Mayorista', 'Persona particular', 'Otro'];
  for (const name of customerTypes) {
    await prisma.customerType.upsert({ where: { name }, update: {}, create: { name } });
  }

  const ranks = [
    { code: 'BRONCE', name: 'Bronce', discountPercentage: 0, creditLimit: 1000 },
    { code: 'PLATA', name: 'Plata', discountPercentage: 2, creditLimit: 3000 },
    { code: 'ORO', name: 'Oro', discountPercentage: 4, creditLimit: 8000 },
  ];
  for (const r of ranks) {
    await prisma.customerRank.upsert({ where: { code: r.code }, update: {}, create: r });
  }

  const suppliers = [
    { name: 'Granja Avícola El Rosal', taxId: '1023456019', phone: '70011122', contactName: 'Rosa Mamani', address: 'Carretera al Norte km 12' },
    { name: 'Avícola SOFIA Distribución', taxId: '1028765011', phone: '70033344', contactName: 'Luis Vargas', address: 'Parque Industrial, mza. 4' },
    { name: 'Granja San Pedro', taxId: '4567890', phone: '70055566', contactName: 'Pedro Quispe', address: 'Comunidad San Pedro' },
  ];
  for (const s of suppliers) {
    // supplier no tiene campo único; se busca por nombre para que el seed siga siendo idempotente.
    const exists = await prisma.supplier.findFirst({ where: { name: s.name } });
    if (!exists) await prisma.supplier.create({ data: s });
  }

  const sequences = [
    { name: 'purchase', prefix: 'C-' },
    { name: 'sale', prefix: 'V-' },
    { name: 'presale', prefix: 'P-' },
    { name: 'lot', prefix: 'L' },
    { name: 'customer', prefix: 'CLI-' },
    { name: 'collection', prefix: 'R-' },
  ];
  for (const s of sequences) {
    await prisma.documentSequence.upsert({ where: { name: s.name }, update: {}, create: s });
  }
}

async function main() {
  await seedSecurity();
  const { branch1 } = await seedOrganization();
  await seedUsers(branch1.id);
  await seedCatalogs();
  console.log('Seed completado.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
