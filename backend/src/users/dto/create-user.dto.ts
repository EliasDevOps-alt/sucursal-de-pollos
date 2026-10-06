import { ApiProperty, ApiPropertyOptional, OmitType, PartialType } from '@nestjs/swagger';
import { ArrayUnique, IsArray, IsBoolean, IsEmail, IsOptional, IsString, IsUUID, Matches, MinLength } from 'class-validator';

export class CreateUserDto {
  @ApiProperty({ example: 'jperez' })
  @IsString()
  @Matches(/^[a-z0-9._-]{3,30}$/, {
    message: 'El usuario debe tener 3–30 caracteres: minúsculas, números, punto, guion o guion bajo',
  })
  username: string;

  @ApiProperty({ example: 'Clave123!' })
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;

  @ApiProperty({ example: 'Juan Pérez' })
  @IsString()
  @MinLength(3)
  fullName: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  phone?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  email?: string;

  @ApiProperty({ description: 'ID del rol' })
  @IsUUID()
  roleId: string;

  @ApiPropertyOptional({ description: 'Sucursal asignada (vendedor de sucursal)' })
  @IsOptional()
  @IsUUID()
  branchId?: string;
}

/** Edición de datos y rol. El usuario (login) y la contraseña se cambian por separado. */
export class UpdateUserDto extends PartialType(OmitType(CreateUserDto, ['username', 'password'] as const)) {
  @ApiPropertyOptional({ description: 'true quita la sucursal asignada' })
  @IsOptional()
  @IsBoolean()
  clearBranch?: boolean;
}

export class ResetPasswordDto {
  @ApiProperty()
  @IsString()
  @MinLength(8, { message: 'La contraseña debe tener al menos 8 caracteres' })
  password: string;
}

export class SetRolePermissionsDto {
  @ApiProperty({ type: [String], example: ['sales.view', 'sales.create'] })
  @IsArray()
  @ArrayUnique()
  @IsString({ each: true })
  permissions: string[];
}
