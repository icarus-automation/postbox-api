import {
  Body,
  ConflictException,
  Controller,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { fromNodeHeaders } from 'better-auth/node';

import { PrismaService } from '../../core/database/prisma.service';
import { auth } from './auth';
import { SetPasswordDto } from './set-password.dto';
import { passwordSlotFor } from './workspace';

export type PasswordApi = {
  getSession: (input: { headers: Headers }) => Promise<{ user: { id: string } } | null>;
  setPassword: (input: { body: { newPassword: string }; headers: Headers }) => Promise<unknown>;
};

@Controller('account')
export class SetPasswordController {
  constructor(private readonly prisma: PrismaService) {}

  @Post('password')
  setPassword(@Req() request: Request, @Body() body: SetPasswordDto): Promise<void> {
    return setInitialPassword({
      api: auth.api,
      db: this.prisma,
      headers: fromNodeHeaders(request.headers),
      newPassword: body.newPassword,
    });
  }
}

export async function setInitialPassword(input: {
  api: PasswordApi;
  db: PrismaService;
  headers: Headers;
  newPassword: string;
}): Promise<void> {
  const session = await input.api.getSession({ headers: input.headers });
  if (!session) throw new UnauthorizedException();

  const slot = await passwordSlotFor(input.db, session.user.id);
  if (slot === 'sealed') {
    throw new ConflictException('Password is already set');
  }

  try {
    await input.api.setPassword({
      body: { newPassword: input.newPassword },
      headers: input.headers,
    });
  } catch (error) {
    if (errorCode(error) === 'PASSWORD_ALREADY_SET') {
      throw new ConflictException('Password is already set');
    }
    if (errorCode(error) === 'UNAUTHORIZED') {
      throw new UnauthorizedException();
    }
    throw error;
  }
}

function errorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const body = (error as { body?: { code?: string } }).body;
  return body?.code;
}
