import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
} from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';

import type { OrganizationSession } from '../auth/types/auth.types';
import { ApiKeysService } from './api-keys.service';
import { CreateApiKeyDTO } from './dto/create-api-key.dto';
import type { ApiKeySummary, CreatedApiKey } from './types/api-keys.types';

@OrgRoles(['owner', 'admin'])
@Controller('api-keys')
export class ApiKeysController {
  constructor(private readonly apiKeysService: ApiKeysService) {}

  @Post()
  createApiKey(
    @Body() body: CreateApiKeyDTO,
    @Session() session: OrganizationSession,
  ): Promise<CreatedApiKey> {
    return this.apiKeysService.createApiKey(
      session.session.activeOrganizationId,
      session.user.id,
      body,
    );
  }

  @Get()
  getAllApiKeys(
    @Session() session: OrganizationSession,
  ): Promise<ApiKeySummary[]> {
    return this.apiKeysService.getAllApiKeys(
      session.session.activeOrganizationId,
    );
  }

  @Delete(':id')
  async revokeApiKey(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
  ): Promise<ApiKeySummary> {
    const apiKey = await this.apiKeysService.revokeApiKey(
      session.session.activeOrganizationId,
      id,
    );
    if (!apiKey) throw new NotFoundException('API key not found');
    return apiKey;
  }
}
