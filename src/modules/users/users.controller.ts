import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';

import type { OrganizationSession } from '../auth/types/auth.types';
import type { OrganizationUser } from './types/users.types';
import { UsersService } from './users.service';

@OrgRoles(['owner', 'admin', 'member'])
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get()
  getAllUsers(
    @Session() session: OrganizationSession,
  ): Promise<OrganizationUser[]> {
    return this.usersService.getAllUsers(
      session.session.activeOrganizationId,
    );
  }

  @Get(':id')
  async getUser(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<OrganizationUser> {
    const user = await this.usersService.getUser(
      session.session.activeOrganizationId,
      id,
    );
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}
