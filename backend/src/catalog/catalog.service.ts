import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  CreateCategoryDto,
  CreateProductDto,
  CreateSupplierDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateSupplierDto,
} from './dto/catalog.dto';

@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  // ── Categorías ──────────────────────────────────────────
  listCategories() {
    return this.prisma.productCategory.findMany({ orderBy: { name: 'asc' } });
  }

  createCategory(dto: CreateCategoryDto) {
    return this.uniqueGuard(() => this.prisma.productCategory.create({ data: dto }), 'categoría');
  }

  async updateCategory(id: string, dto: UpdateCategoryDto) {
    const exists = await this.prisma.productCategory.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException('Categoría no encontrada');
    return this.uniqueGuard(() => this.prisma.productCategory.update({ where: { id }, data: dto }), 'categoría');
  }

  // ── Productos ───────────────────────────────────────────
  listProducts(includeInactive = false) {
    return this.prisma.product.findMany({
      where: includeInactive ? {} : { isActive: true },
      include: { category: { select: { id: true, code: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  async createProduct(dto: CreateProductDto, actorId: string) {
    const product = await this.uniqueGuard(() => this.prisma.product.create({ data: dto }), 'producto');
    await this.audit.log({ userId: actorId, action: 'products.create', entityType: 'product', entityId: product.id, newData: dto });
    return product;
  }

  async updateProduct(id: string, dto: UpdateProductDto, actorId: string) {
    const before = await this.prisma.product.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Producto no encontrado');
    const product = await this.uniqueGuard(() => this.prisma.product.update({ where: { id }, data: dto }), 'producto');
    await this.audit.log({ userId: actorId, action: 'products.update', entityType: 'product', entityId: id, oldData: before, newData: dto });
    return product;
  }

  // ── Proveedores ─────────────────────────────────────────
  listSuppliers(includeInactive = false) {
    return this.prisma.supplier.findMany({
      where: includeInactive ? {} : { isActive: true },
      orderBy: { name: 'asc' },
    });
  }

  async createSupplier(dto: CreateSupplierDto, actorId: string) {
    const supplier = await this.prisma.supplier.create({ data: dto });
    await this.audit.log({ userId: actorId, action: 'suppliers.create', entityType: 'supplier', entityId: supplier.id, newData: dto });
    return supplier;
  }

  async updateSupplier(id: string, dto: UpdateSupplierDto, actorId: string) {
    const before = await this.prisma.supplier.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Proveedor no encontrado');
    const supplier = await this.prisma.supplier.update({ where: { id }, data: dto });
    await this.audit.log({ userId: actorId, action: 'suppliers.update', entityType: 'supplier', entityId: id, oldData: before, newData: dto });
    return supplier;
  }

  // ── Organización ────────────────────────────────────────
  listBranches() {
    return this.prisma.branch.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } });
  }

  listWarehouses() {
    return this.prisma.warehouse.findMany({
      where: { isActive: true },
      include: { branch: { select: { id: true, code: true, name: true } } },
      orderBy: { name: 'asc' },
    });
  }

  /** Traduce la violación de unicidad de Prisma (P2002) a un 409 legible. */
  private async uniqueGuard<T>(fn: () => Promise<T>, entity: string): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException(`Ya existe un(a) ${entity} con ese código`);
      }
      throw e;
    }
  }
}
