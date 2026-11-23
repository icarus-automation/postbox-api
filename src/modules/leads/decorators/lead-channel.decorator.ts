import {
  createParamDecorator,
  ExecutionContext,
  UnauthorizedException,
} from '@nestjs/common';
import { LeadChannel } from '@prisma/client';

import type { ApiKeyRequest } from '../../api-keys/types/api-keys.types';

// The channel of a lead is the key that filed it: an admin API key is an agent,
// the integration key is a website form. LeadIntakeGuard admits exactly one of
// them, and the body never has a say.
export const KeyLeadChannel = createParamDecorator(
  (_data: unknown, context: ExecutionContext): LeadChannel => {
    const request = context.switchToHttp().getRequest<ApiKeyRequest>();

    if (request.apiKey) return LeadChannel.agent;
    if (request.integrationKey) return LeadChannel.form;

    throw new UnauthorizedException();
  },
);
