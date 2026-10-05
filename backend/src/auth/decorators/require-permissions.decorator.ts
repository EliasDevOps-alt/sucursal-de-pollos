import { SetMetadata } from '@nestjs/common';
import { PermissionCode } from '../permissions';

export const PERMISSIONS_KEY = 'permissions';

/** Exige que el usuario tenga todos los permisos indicados. */
export const RequirePermissions = (...permissions: PermissionCode[]) =>
  SetMetadata(PERMISSIONS_KEY, permissions);
