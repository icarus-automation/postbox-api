import {
  Body,
  Controller,
  Get,
  Inject,
  Post,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { AllowAnonymous, OrgRoles, Session, type UserSession } from '@thallesp/nestjs-better-auth';
import { fromNodeHeaders } from 'better-auth/node';

import { env } from '../../core/config/env.config';
import { PrismaService } from '../../core/database/prisma.service';
import { OBJECT_STORAGE, type ObjectStorage } from '../blog/object-storage';
import { auth, type Auth } from './auth';
import {
  foundWorkspace,
  presignLogoHold,
  previewSlug,
  readAdmission,
  saveProfile,
  type Admission,
  type SealedWorkspace,
  type SlugPreview,
} from './workspace';
import { FoundWorkspaceDto, LogoHoldDto, SaveProfileDto, SlugPreviewDto } from './workspace.dto';

@Controller('workspaces')
export class WorkspaceController {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  @Get('admission')
  @AllowAnonymous()
  admission(@Req() request: Request): Promise<Admission> {
    return this.read(request);
  }

  @Post('slug-preview')
  preview(@Body() body: SlugPreviewDto): Promise<SlugPreview> {
    return previewSlug(this.prisma, body.slug);
  }

  @Post('logo-holds')
  hold(@Session() session: UserSession<Auth>, @Body() body: LogoHoldDto) {
    return presignLogoHold(this.storage, session.user.id, body);
  }

  @Post()
  found(
    @Session() session: UserSession<Auth>,
    @Body() body: FoundWorkspaceDto,
  ): Promise<SealedWorkspace> {
    return foundWorkspace(auth.api, this.prisma, this.storage, session.user.id, {
      name: body.name,
      slug: body.slug,
      website: body.website ?? null,
      logoHoldKey: body.logoHoldKey ?? null,
    });
  }

  @Post('profile')
  @OrgRoles(['owner', 'admin'])
  save(
    @Session() session: UserSession<Auth>,
    @Req() request: Request,
    @Body() body: SaveProfileDto,
  ): Promise<SealedWorkspace> {
    const logo =
      body.logo.kind === 'hold'
        ? { kind: 'hold' as const, storageKey: body.logo.storageKey ?? '' }
        : body.logo.kind === 'clear'
          ? { kind: 'clear' as const }
          : { kind: 'unchanged' as const };

    return saveProfile(
      auth.api,
      this.prisma,
      this.storage,
      session.user.id,
      fromNodeHeaders(request.headers),
      {
        name: body.name,
        website: body.website ?? null,
        logo,
      },
    );
  }

  private async read(request: Request): Promise<Admission> {
    const headers = fromNodeHeaders(request.headers);
    const session = await auth.api.getSession({ headers });

    return readAdmission(this.prisma, {
      user: session
        ? { id: session.user.id, name: session.user.name, email: session.user.email }
        : null,
      workspaceUrlPrefix: env.WORKSPACE_URL_PREFIX,
      activeOrganizationId: session?.session.activeOrganizationId ?? null,
    });
  }
}
