import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { CreateUserDto, ResetPasswordDto, SetRolePermissionsDto, UpdateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

class SetActiveDto {
  @IsBoolean()
  isActive: boolean;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller()
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get('users')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  findAll() {
    return this.users.findAll();
  }

  @Get('users/roles')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  roles() {
    return this.users.listRoles();
  }

  @Get('permissions')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  permissions() {
    return this.users.listPermissions();
  }

  @Put('roles/:id/permissions')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  setRolePermissions(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetRolePermissionsDto, @CurrentUser() actor: AuthUser) {
    return this.users.setRolePermissions(id, dto.permissions, actor.id);
  }

  @Post('users')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor.id);
  }

  @Patch('users/:id')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.update(id, dto, actor.id);
  }

  @Post('users/:id/password')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  resetPassword(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ResetPasswordDto, @CurrentUser() actor: AuthUser) {
    return this.users.resetPassword(id, dto.password, actor.id);
  }

  @Patch('users/:id/active')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  setActive(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SetActiveDto, @CurrentUser() actor: AuthUser) {
    return this.users.setActive(id, dto.isActive, actor.id);
  }
}
