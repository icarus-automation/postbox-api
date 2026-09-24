import {
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Post,
  Req,
} from '@nestjs/common';
import { OrgRoles, Session } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';
import type { Request } from 'express';

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

  // Better Auth reads the session off the request for its own listing, so this
  // route hands it the same headers the guard already authenticated.
  @Get()
  getAllApiKeys(
    @Session() session: OrganizationSession,
    @Req() request: Request,
  ): Promise<ApiKeySummary[]> {
    return this.apiKeysService.getAllApiKeys(
      session.session.activeOrganizationId,
      fromNodeHeaders(request.headers),
    );
  }

  @Delete(':id')
  async revokeApiKey(
    @Param('id') id: string,
    @Session() session: OrganizationSession,
    @Req() request: Request,
  ): Promise<ApiKeySummary> {
    const apiKey = await this.apiKeysService.revokeApiKey(
      session.session.activeOrganizationId,
      id,
      session.user.id,
      fromNodeHeaders(request.headers),
    );
    if (!apiKey) throw new NotFoundException('API key not found');
    return apiKey;
  }
}
