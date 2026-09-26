import { Body, Controller, NotFoundException, Post } from '@nestjs/common';
import { OrgRoles } from '@thallesp/nestjs-better-auth';

import { CurrentOrganizationId } from '../api-keys/decorators/current-organization-id.decorator';
import { SessionOrApiKey } from '../api-keys/decorators/session-or-api-key.decorator';
import { ContentMediaService } from './content-media.service';
import type { MediaRef } from './document/content.types';
import { ConfirmMediaDTO } from './dto/confirm-media.dto';
import { CreateMediaUploadDTO } from './dto/create-media-upload.dto';

@OrgRoles(['owner', 'admin', 'member'])
@Controller('media')
export class ContentMediaController {
  constructor(private readonly media: ContentMediaService) {}

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Post('uploads')
  createMediaUpload(
    @Body() body: CreateMediaUploadDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<{
    uploadUrl: string;
    storageKey: string;
    headers: Record<string, string>;
  }> {
    return this.media.presign(organizationId, body);
  }

  @SessionOrApiKey(['owner', 'admin', 'member'])
  @Post('confirm')
  async confirmMedia(
    @Body() body: ConfirmMediaDTO,
    @CurrentOrganizationId() organizationId: string,
  ): Promise<MediaRef> {
    const media = await this.media.confirm(organizationId, body);
    if (!media) throw new NotFoundException('Media not found');
    return media;
  }
}
