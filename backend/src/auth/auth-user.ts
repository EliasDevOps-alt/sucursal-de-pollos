export interface AuthUser {
  id: string;
  username: string;
  fullName: string;
  roleCode: string;
  roleName: string;
  branchId: string | null;
  permissions: string[];
}

export interface JwtPayload {
  sub: string;
  username: string;
}
