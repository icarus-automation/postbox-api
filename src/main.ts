import { NestFactory } from '@nestjs/core';
import { Logger, VersioningType } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';

import helmet from 'helmet';

import { AppModule } from './app.module';
import { env } from './core/config/env.config';
import { sharedCookieDomain } from './modules/auth/cookie-config';
import { publicApiCors } from './modules/blog/public-api-cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bodyParser: false,
  });

  // Caddy is the one proxy hop in front of the API. It lets the throttler see the caller's IP.
  app.set('trust proxy', 1);

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  app.enableShutdownHooks();

  app.use(helmet());

  // Before enableCors, which answers every preflight itself and would otherwise end
  // the ones for /public with no origin allowed.
  app.use(publicApiCors);

  app.enableCors({
    origin: env.CORS_ALLOWED_ORIGINS,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: true,
  });

  if (env.COOKIE_DOMAIN && !sharedCookieDomain(env.BETTER_AUTH_URL, env.COOKIE_DOMAIN)) {
    new Logger('Bootstrap').warn(
      `COOKIE_DOMAIN ${env.COOKIE_DOMAIN} does not cover ${env.BETTER_AUTH_URL} over https, so auth cookies stay host-only.`,
    );
  }

  await app.listen(env.PORT, '0.0.0.0');
}
bootstrap().catch((error: unknown) => {
  console.error('Application failed to start:', error);
  process.exit(1);
});
