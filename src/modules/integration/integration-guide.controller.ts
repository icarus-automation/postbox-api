import { Controller, Get, Header } from '@nestjs/common';
import { AllowAnonymous } from '@thallesp/nestjs-better-auth';

import { env } from '../../core/config/env.config';
import { renderIntegrationGuide } from './integration-guide';

// Open to anyone, so an agent can fetch it without a key. The address in the text
// follows BETTER_AUTH_URL, which is the public address of this API, so a domain
// move needs no edit here.
@AllowAnonymous()
@Controller('docs')
export class IntegrationGuideController {
  private readonly guide = renderIntegrationGuide(
    `${env.BETTER_AUTH_URL.replace(/\/+$/, '')}/api/v1`,
  );

  // text/plain so a browser shows the page where text/markdown would download it.
  @Header('Content-Type', 'text/plain; charset=utf-8')
  @Header('Cache-Control', 'public, max-age=300')
  @Get('integration.md')
  getIntegrationGuide(): string {
    return this.guide;
  }
}
