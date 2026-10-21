import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';
import { AuditService } from '../audit/audit.service';
import { PrismaService } from '../prisma/prisma.service';
import { AuthUser, JwtPayload } from './auth-user';
import { LoginAttempts } from './login-attempts';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}

  // Por cuenta: 5 fallos en 15 min la bloquean 15 min (también al autorizar con credenciales de supervisor).
  private readonly byUser = new LoginAttempts(Number(process.env.LOGIN_MAX_FAILURES ?? 5));
  // Por IP, solo en el ingreso: frena a quien prueba muchos usuarios desde el mismo lugar.
  private readonly byIp = new LoginAttempts(Number(process.env.LOGIN_MAX_FAILURES_IP ?? 20));

  async login(username: string, password: string, client: 'web' | 'mobile' = 'web', ip = '') {
    this.byIp.assertAllowed(ip);
    const user = await this.verifyCredentials(username, password);
    // Mismo mensaje para usuario inexistente y contraseña errónea: no revela qué usuarios existen.
    if (!user) {
      this.byIp.fail(ip);
      throw new UnauthorizedException('Usuario o contraseña incorrectos');
    }

    const payload: JwtPayload = { sub: user.id, username: user.username };
    // El preventista puede pasar días sin señal: su token dura más para no perder la sesión offline.
    const accessToken = await this.jwt.signAsync(payload, client === 'mobile' ? { expiresIn: '7d' } : {});
    await this.audit.log({ userId: user.id, action: 'auth.login', entityType: 'user', entityId: user.id, newData: { client } });

    return { accessToken, user };
  }

  /** Usuarios activos para la pantalla de ingreso (solo nombre visible y rol; nunca datos de contacto). */
  async loginUsers() {
    const users = await this.prisma.user.findMany({
      where: { isActive: true, role: { isActive: true } },
      select: { username: true, fullName: true, role: { select: { code: true, name: true } } },
      orderBy: { fullName: 'asc' },
    });
    return users.map((u) => ({ username: u.username, fullName: u.fullName, roleCode: u.role.code, roleName: u.role.name }));
  }

  /** Devuelve el usuario si las credenciales son válidas y está activo; si no, null. */
  async verifyCredentials(username: string, password: string): Promise<AuthUser | null> {
    const key = username.trim().toLowerCase();
    this.byUser.assertAllowed(key);
    const user = await this.prisma.user.findUnique({ where: { username } });
    if (!user || !user.isActive || !(await bcrypt.compare(password, user.passwordHash))) {
      this.byUser.fail(key);
      if (user) await this.audit.log({ userId: user.id, action: 'auth.failed', entityType: 'user', entityId: user.id });
      return null;
    }
    this.byUser.reset(key);
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
