import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, RouteStatus, VehicleOwnership, WarehouseType } from '@prisma/client';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth-user';
import { PrismaService } from '../prisma/prisma.service';
import { CreateVehicleDto, UpdateVehicleDto } from './dto/logistics.dto';

/**
 * Vehículos propios y subcontratados. Cada uno tiene un almacén móvil (tipo VEHICLE):
 * al despachar una ruta la carga se transfiere a ese almacén y las entregas salen de ahí.
 */
@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  async findAll() {
    const vehicles = await this.prisma.vehicle.findMany({ orderBy: [{ isActive: 'desc' }, { plate: 'asc' }] });
    // Ruta activa de cada vehículo (si está en la calle).
    const active = await this.prisma.deliveryRoute.findMany({
      where: { status: { in: [RouteStatus.PLANNED, RouteStatus.IN_PROGRESS] } },
      select: { id: true, routeNumber: true, routeDate: true, status: true, vehicleId: true },
    });
    return vehicles.map((v) => ({ ...v, activeRoutes: active.filter((r) => r.vehicleId === v.id) }));
  }

  async create(dto: CreateVehicleDto, actor: AuthUser) {
    const plate = dto.plate.trim().toUpperCase();
    if (dto.ownership === VehicleOwnership.SUBCONTRACTED && !dto.ownerName?.trim()) {
      throw new BadRequestException('Indique la empresa o el dueño del vehículo subcontratado');
    }
    try {
      return await this.prisma.$transaction(async (tx) => {
        const warehouse = await tx.warehouse.create({
          data: { code: `VEH-${plate}`, name: `Vehículo ${plate}`, type: WarehouseType.VEHICLE },
        });
        const vehicle = await tx.vehicle.create({
          data: {
            plate,
            description: dto.description.trim(),
            ownership: dto.ownership,
            ownerName: dto.ownerName?.trim() || null,
            capacityKg: dto.capacityKg,
            capacityCrates: dto.capacityCrates,
            warehouseId: warehouse.id,
          },
        });
        await this.audit.log({ userId: actor.id, action: 'vehicles.create', entityType: 'vehicle', entityId: vehicle.id, newData: dto }, tx);
        return vehicle;
      });
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') throw new ConflictException(`Ya existe un vehículo con la placa ${plate}`);
      throw e;
    }
  }

  async update(id: string, dto: UpdateVehicleDto, actor: AuthUser) {
    const before = await this.prisma.vehicle.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('Vehículo no encontrado');
    if (dto.isActive === false) {
      const busy = await this.prisma.deliveryRoute.count({ where: { vehicleId: id, status: { in: [RouteStatus.PLANNED, RouteStatus.IN_PROGRESS] } } });
      if (busy) throw new ConflictException('El vehículo tiene una ruta planificada o en curso');
    }
    const ownership = dto.ownership ?? before.ownership;
    const ownerName = dto.ownerName !== undefined ? dto.ownerName.trim() || null : before.ownerName;
    if (ownership === VehicleOwnership.SUBCONTRACTED && !ownerName) {
      throw new BadRequestException('Indique la empresa o el dueño del vehículo subcontratado');
    }
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        description: dto.description?.trim(),
        ownership,
        ownerName: ownership === VehicleOwnership.OWN ? null : ownerName,
        capacityKg: dto.capacityKg,
        capacityCrates: dto.capacityCrates,
        isActive: dto.isActive,
      },
    });
    await this.audit.log({ userId: actor.id, action: 'vehicles.update', entityType: 'vehicle', entityId: id, oldData: before, newData: dto });
    return vehicle;
  }
}
