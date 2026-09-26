import { ConflictException, UnauthorizedException } from '@nestjs/common';
import { mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import { setInitialPassword, type PasswordApi } from './set-password.controller';

describe('setInitialPassword', () => {
  const prisma = mockDeep<PrismaService>();
  const headers = new Headers({ cookie: 'better-auth.session_token=session-token' });
  const getSession = jest.fn();
  const setPassword = jest.fn();
  const api = { getSession, setPassword } as PasswordApi;

  beforeEach(() => {
    mockReset(prisma);
    getSession.mockReset();
    setPassword.mockReset();
    setPassword.mockResolvedValue({ status: true });
  });

  it('rejects a missing session with 401 and does not set a password', async () => {
    getSession.mockResolvedValue(null);

    await expect(
      setInitialPassword({ api, db: prisma, headers, newPassword: 'correct-horse' }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(setPassword).not.toHaveBeenCalled();
  });

  it('calls setPassword with the cookie when the slot is open', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-a' }, session: { id: 'session-a' } });
    prisma.account.findFirst.mockResolvedValue(null);

    await setInitialPassword({
      api,
      db: prisma,
      headers,
      newPassword: 'correct-horse',
    });

    expect(setPassword).toHaveBeenCalledWith({
      body: { newPassword: 'correct-horse' },
      headers,
    });
  });

  it('answers 409 when the slot is sealed or the plugin says the password is already set', async () => {
    getSession.mockResolvedValue({ user: { id: 'user-a' }, session: { id: 'session-a' } });
    prisma.account.findFirst.mockResolvedValue({ password: 'existing-hash' } as never);

    await expect(
      setInitialPassword({ api, db: prisma, headers, newPassword: 'correct-horse' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(setPassword).not.toHaveBeenCalled();

    prisma.account.findFirst.mockResolvedValue({ password: null } as never);
    setPassword.mockRejectedValue({
      body: { code: 'PASSWORD_ALREADY_SET' },
    });

    await expect(
      setInitialPassword({ api, db: prisma, headers, newPassword: 'correct-horse' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});
