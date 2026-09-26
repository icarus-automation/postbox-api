import { createParamDecorator, ExecutionContext, UnauthorizedException } from '@nestjs/common';

export const PublicOrganizationId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context
      .switchToHttp()
      .getRequest<{ publicOrganizationId?: string }>();
    if (!request.publicOrganizationId) throw new UnauthorizedException();
    return request.publicOrganizationId;
  },
);
