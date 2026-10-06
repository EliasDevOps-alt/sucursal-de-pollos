import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from './auth-user';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  async login(username: string, password: string, client: 'web' | 'mobile' = 'web') {
    const user = await this.verifyCredentials(username, password);
    // Mismo mensaje para usuario inexistente y contraseña errónea: no revela qué usuarios existen.
    if (!user) throw new UnauthorizedException('Usuario o contraseña incorrectos');

    const payload: JwtPayload = { sub: user.id, username: user.username };
    // El preventista puede pasar días sin señal: su token dura más para no perder la sesión offline.
    const accessToken = await this.jwt.signAsync(payload, client === 'mobile' ? { expiresIn: '7d' } : {});
    await this.audit.log({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, newData: { client } });

    return { accessToken, user };
  }

  /** Devuelve el usuario si las credenciales son válidas y está activo; si no, null. */
  async verifyCredentials(username: string, password: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) return null;
    return this.loadAuthUser(user.id);
  }

  async loadAuthUser(userId: string): Promise<AuthUser | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });
    if (!user || !user.isActive || !user.role.isActive) return null;

    return {
      id: user.id,
      username: user.username,
      fullName: user.fullName,
      roleCode: user.role.code,
      roleName: user.role.name,
      branchId: user.branchId,
      permissions: user.role.permissions.map((rp) => rp.permission.code),
    };
  }
}
