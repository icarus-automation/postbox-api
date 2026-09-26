import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';

import { ContentAccessService } from '../content-access.service';

type PublicRequest = {
  headers: Record<string, string | string[] | undefined>;
  params: { orgSlug?: string };
  publicOrganizationId?: string;
};

@Injectable()
export class PublicReadKeyGuard implements CanActivate {
  constructor(private readonly access: ContentAccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<PublicRequest>();
    const header = request.headers['x-public-key'];
    const raw = (Array.isArray(header) ? header[0] : header)?.trim();
    const orgSlug = request.params?.orgSlug;
    if (!raw || !orgSlug) throw new UnauthorizedException();
    const organizationId = await this.access.authenticate(orgSlug, raw);
    if (!organizationId) throw new UnauthorizedException();
    request.publicOrganizationId = organizationId;
    return true;
  }
}
