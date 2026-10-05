import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';

// Campos que se devuelven al cliente: nunca el hash de la contraseña.
const userSelect = {
  id: true,
  username: true,
  fullName: true,
  phone: true,
  email: true,
  isActive: true,
  createdAt: true,
  role: { select: { id: true, code: true, name: true } },
  branch: { select: { id: true, code: true, name: true } },
} as const;

@Injectable()
export class UsersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
  ) {}

  findAll() {
    return this.prisma.user.findMany({ select: userSelect, orderBy: { fullName: 'asc' } });
  }

  listRoles() {
    return this.prisma.role.findMany({
      where: { isActive: true },
      select: { id: true, code: true, name: true },
      orderBy: { name: 'asc' },
    });
  }

  async create(dto: CreateUserDto, actorId: string) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException('El nombre de usuario ya existe');

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Rol no encontrado');

    const { password, ...data } = dto;
    const user = await this.prisma.user.create({
      data: { ...data, passwordHash: await bcrypt.hash(password, 10) },
      select: userSelect,
    });
    await this.audit.log({
      userId: actorId,
      action: 'users.create',
      entityType: 'user',
      entityId: user.id,
      newData: { username: user.username, role: role.code },
    });
    return user;
  }

  async setActive(id: string, isActive: boolean, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');

    const updated = await this.prisma.user.update({ where: { id }, data: { isActive }, select: userSelect });
    await this.audit.log({
      userId: actorId,
      action: isActive ? 'users.activate' : 'users.deactivate',
      entityType: 'user',
      entityId: id,
      oldData: { isActive: user.isActive },
      newData: { isActive },
    });
    return updated;
  }
}
