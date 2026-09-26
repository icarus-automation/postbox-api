import { Module, type NestModule } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';

import { publicApiCors } from './public-api-cors';

// use() here, and this module imported first, so the preflight is answered
// before Better Auth's CORS middleware ends it.
@Module({})
export class PublicApiCorsModule implements NestModule {
  constructor(private readonly adapterHost: HttpAdapterHost) {}

  configure(): void {
    this.adapterHost.httpAdapter.use(publicApiCors);
  }
}
