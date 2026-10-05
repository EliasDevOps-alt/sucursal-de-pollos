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

  async login(username: string, password: string) {
    const user = await this.prisma.user.findUnique({ where: { username } });
    // Mismo mensaje para usuario inexistente y contraseña errónea: no revela qué usuarios existen.
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const payload: JwtPayload = { sub: user.id, username: user.username };
    const accessToken = await this.jwt.signAsync(payload);
    await this.audit.log({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id });

    return { accessToken, user: await this.loadAuthUser(user.id) };
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
