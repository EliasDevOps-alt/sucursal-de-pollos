import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PERMISSIONS } from '../auth/permissions';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto, UpdateUserDto } from './dto/create-user.dto';

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

  // ── Roles y permisos ─────────────────────────────────────

  async listRoles() {
    const roles = await this.prisma.role.findMany({
      where: { isActive: true },
      include: { permissions: { include: { permission: true } }, _count: { select: { users: true } } },
      orderBy: { name: 'asc' },
    });
    return roles.map((r) => ({
      id: r.id,
      code: r.code,
      name: r.name,
      users: r._count.users,
      permissions: r.permissions.map((p) => p.permission.code).sort(),
    }));
  }

  listPermissions() {
    return this.prisma.permission.findMany({ orderBy: [{ module: 'asc' }, { code: 'asc' }] });
  }

  /** Reemplaza los permisos de un rol. El Administrador nunca pierde la gestión de usuarios (evita quedar sin acceso). */
  async setRolePermissions(roleId: string, codes: string[], actorId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, include: { permissions: { include: { permission: true } } } });
    if (!role) throw new NotFoundException('Rol no encontrado');
    if (role.code === 'ADMIN' && !codes.includes(PERMISSIONS.USERS_MANAGE)) {
      throw new BadRequestException('El rol Administrador debe conservar el permiso de gestionar usuarios');
    }
    const permissions = await this.prisma.permission.findMany({ where: { code: { in: codes } } });
    const unknown = codes.filter((c) => !permissions.some((p) => p.code === c));
    if (unknown.length) throw new BadRequestException(`Permisos inexistentes: ${unknown.join(', ')}`);

    const before = role.permissions.map((p) => p.permission.code).sort();
    await this.prisma.$transaction(async (tx) => {
      await tx.rolePermission.deleteMany({ where: { roleId } });
      await tx.rolePermission.createMany({ data: permissions.map((p) => ({ roleId, permissionId: p.id })) });
      await this.audit.log(
        {
          userId: actorId,
          action: 'roles.permissions_change',
          entityType: 'role',
          entityId: roleId,
          oldData: { added: [], removed: before.filter((c) => !codes.includes(c)) },
          newData: { added: codes.filter((c) => !before.includes(c)), role: role.code },
        },
        tx,
      );
    });
    return (await this.listRoles()).find((r) => r.id === roleId);
  }

  // ── Usuarios ─────────────────────────────────────────────

  async create(dto: CreateUserDto, actorId: string) {
    const exists = await this.prisma.user.findUnique({ where: { username: dto.username } });
    if (exists) throw new ConflictException('El nombre de usuario ya existe');

    const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
    if (!role) throw new NotFoundException('Rol no encontrado');

    const { password, ...data } = dto;
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await this.uniqueGuard(() => this.prisma.user.create({ data: { ...data, passwordHash }, select: userSelect }));
    await this.audit.log({
      userId: actorId,
      action: 'users.create',
      entityType: 'user',
      entityId: user.id,
      newData: { username: user.username, role: role.code },
    });
    return user;
  }

  async update(id: string, dto: UpdateUserDto, actorId: string) {
    const before = await this.prisma.user.findUnique({ where: { id }, select: userSelect });
    if (!before) throw new NotFoundException('Usuario no encontrado');
    if (dto.roleId) {
      const role = await this.prisma.role.findUnique({ where: { id: dto.roleId } });
      if (!role) throw new NotFoundException('Rol no encontrado');
      if (id === actorId && role.code !== before.role.code) throw new BadRequestException('No puede cambiar su propio rol');
    }
    const { clearBranch, ...fields } = dto;
    const data = { ...fields, ...(clearBranch ? { branchId: null } : {}) };
    const user = await this.uniqueGuard(() => this.prisma.user.update({ where: { id }, data, select: userSelect }));
    await this.audit.log({
      userId: actorId,
      action: dto.roleId && dto.roleId !== before.role.id ? 'users.role_change' : 'users.update',
      entityType: 'user',
      entityId: id,
      oldData: { fullName: before.fullName, role: before.role.code, branch: before.branch?.code ?? null },
      newData: { fullName: user.fullName, role: user.role.code, branch: user.branch?.code ?? null },
    });
    return user;
  }

  async resetPassword(id: string, password: string, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    await this.prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(password, 10) } });
    await this.audit.log({ userId: actorId, action: 'users.password_reset', entityType: 'user', entityId: id });
    return { ok: true };
  }

  async setActive(id: string, isActive: boolean, actorId: string) {
    const user = await this.prisma.user.findUnique({ where: { id } });
    if (!user) throw new NotFoundException('Usuario no encontrado');
    if (id === actorId && !isActive) throw new BadRequestException('No puede bloquear su propio usuario');

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

  private async uniqueGuard<T>(fn: () => Promise<T>): Promise<T> {
    try {
      return await fn();
    } catch (e) {
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        throw new ConflictException('Ya existe un usuario con ese nombre o correo');
      }
      throw e;
    }
  }
}
