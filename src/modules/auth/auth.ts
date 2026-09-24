import { apiKey } from '@better-auth/api-key';
import { prismaAdapter } from '@better-auth/prisma-adapter';
import * as bcrypt from 'bcrypt';
import { APIError } from 'better-auth/api';
import { betterAuth } from 'better-auth';
import { hashPassword, verifyPassword } from 'better-auth/crypto';
import { organization } from 'better-auth/plugins';

import { env } from '../../core/config/env.config';
import { prisma } from '../../core/database/prisma.service';
import { provisionLeadSystemFields } from '../leads/lead-system-fields';
import {
  API_KEY_NAME_MAX_LENGTH,
  API_KEY_PREFIX,
  API_KEY_START_LENGTH,
} from './api-key-config';
import {
  organizationAccessControl,
  organizationRoles,
} from './organization-access';
import { getUserOrganizationId } from './organization-provisioning';

const SINGLE_ORGANIZATION_MESSAGE = 'Users can belong to only one organization';

async function ensureUserHasNoOrganization(userId: string): Promise<void> {
  const membership = await prisma.member.findFirst({
    where: { userId },
    select: { id: true },
  });

  if (membership) {
    throw new APIError('FORBIDDEN', {
      message: SINGLE_ORGANIZATION_MESSAGE,
    });
  }
}

// The migration keeps legacy bcrypt hashes. New passwords use Better Auth's scrypt.

async function verifyPasswordHash(credentials: {
  hash: string;
  password: string;
}): Promise<boolean> {
  if (credentials.hash.startsWith('$2')) {
    return bcrypt.compare(credentials.password, credentials.hash);
  }

  return verifyPassword(credentials);
}

export const auth = betterAuth({
  appName: 'backend-boilerplate',
  baseURL: env.BETTER_AUTH_URL,
  basePath: '/api/v1/auth',
  secret: env.BETTER_AUTH_SECRET,
  database: prismaAdapter(prisma, {
    provider: 'postgresql',
  }),
  emailAndPassword: {
    enabled: true,
    password: {
      hash: hashPassword,
      verify: verifyPasswordHash,
    },
  },
  trustedOrigins: env.CORS_ALLOWED_ORIGINS,
  rateLimit: {
    enabled: true,
    storage: 'database',
  },
  advanced: {
    database: {
      joins: true,
    },
  },
  // OrganizationProvisioningHook adds the user create hook here at module init.
  databaseHooks: {
    session: {
      create: {
        before: async (session) => {
          const organizationId = await getUserOrganizationId(
            prisma,
            session.userId,
          );

          if (!organizationId) return;

          return { data: { ...session, activeOrganizationId: organizationId } };
        },
      },
    },
  },
  plugins: [
    organization({
      organizationLimit: 1,
      ac: organizationAccessControl,
      roles: organizationRoles,
      organizationHooks: {
        // The one path that seeds lead system fields, for sign-up provisioning
        // and for an organization created through the organization API alike.
        afterCreateOrganization: async ({ organization }) => {
          await provisionLeadSystemFields(prisma, organization.id);
        },
        beforeCreateInvitation: async ({ invitation }) => {
          const invitedUser = await prisma.user.findUnique({
            where: { email: invitation.email.toLowerCase() },
            select: { id: true },
          });

          if (invitedUser) {
            await ensureUserHasNoOrganization(invitedUser.id);
          }
        },
        beforeAddMember: async ({ user }) => {
          await ensureUserHasNoOrganization(user.id);
        },
        beforeAcceptInvitation: async ({ user }) => {
          await ensureUserHasNoOrganization(user.id);
        },
      },
    }),
    apiKey({
      references: 'organization',
      defaultPrefix: API_KEY_PREFIX,
      requireName: true,
      maximumNameLength: API_KEY_NAME_MAX_LENGTH,
      startingCharactersConfig: {
        shouldStore: true,
        charactersLength: API_KEY_START_LENGTH,
      },
      // Carries the creator, which the table used to hold in its own column.
      enableMetadata: true,
      // Nest throttling already covers these routes, and turning the plugin's
      // own limiter on would change what machine callers are allowed to send.
      rateLimit: { enabled: false },
      schema: { apikey: { modelName: 'apiKey' } },
    }),
  ],
});

export type Auth = typeof auth;
