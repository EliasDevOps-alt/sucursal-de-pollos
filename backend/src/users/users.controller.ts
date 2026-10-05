import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { IsBoolean } from 'class-validator';
import { AuthUser } from '../auth/auth-user';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { RequirePermissions } from '../auth/decorators/require-permissions.decorator';
import { PERMISSIONS } from '../auth/permissions';
import { CreateUserDto } from './dto/create-user.dto';
import { UsersService } from './users.service';

class SetActiveDto {
  @IsBoolean()
  isActive: boolean;
}

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  findAll() {
    return this.users.findAll();
  }

  @Get('roles')
  @RequirePermissions(PERMISSIONS.USERS_VIEW)
  roles() {
    return this.users.listRoles();
  }

  @Post()
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  create(@Body() dto: CreateUserDto, @CurrentUser() actor: AuthUser) {
    return this.users.create(dto, actor.id);
  }

  @Patch(':id/active')
  @RequirePermissions(PERMISSIONS.USERS_MANAGE)
  setActive(
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
    @CurrentUser() actor: AuthUser,
  ) {
    return this.users.setActive(id, dto.isActive, actor.id);
  }
}
