import { INestApplication, VersioningType } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { FieldType } from '@prisma/client';
import { AuthService } from '@thallesp/nestjs-better-auth';
import request from 'supertest';
import { App } from 'supertest/types';

import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/core/database/prisma.service';

const leadFields = [
  {
    id: 'field-candidate',
    key: 'candidate',
    label: 'Contact',
    type: FieldType.text,
    options: [],
    isRequired: true,
    isReadOnly: false,
    isSystem: true,
    position: 0,
  },
  {
    id: 'field-status',
    key: 'status',
    label: 'Status',
    type: FieldType.select,
    options: ['new', 'contacted', 'qualified'],
    isRequired: false,
    isReadOnly: true,
    isSystem: true,
    position: 1,
  },
];

// Better Auth owns key verification now, and it reads through its own Prisma
// client rather than the injected one, so the key seam for these tests is the
// verify call itself.
describe('Application authentication (e2e)', () => {
  const verifyApiKey = jest.fn();
  const fieldDefinitionFindMany = jest.fn();
  const leadCreate = jest.fn();
  const leadCount = jest.fn();
  const leadFindMany = jest.fn();
  const leadFindFirst = jest.fn();

  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({
        fieldDefinition: { findMany: fieldDefinitionFindMany },
        lead: {
          create: leadCreate,
          count: leadCount,
          findMany: leadFindMany,
          findFirst: leadFindFirst,
        },
      })
      .overrideProvider(AuthService)
      .useValue({ api: { verifyApiKey } })
      .compile();

    app = moduleFixture.createNestApplication({
      bodyParser: false,
    });
    app.setGlobalPrefix('api');
    app.enableVersioning({
      type: VersioningType.URI,
      defaultVersion: '1',
    });
    await app.init();
  });

  beforeEach(() => {
    verifyApiKey.mockReset();
    verifyApiKey.mockResolvedValue({
      valid: false,
      error: { code: 'INVALID_API_KEY' },
      key: null,
    });
    fieldDefinitionFindMany.mockReset();
    fieldDefinitionFindMany.mockResolvedValue(leadFields);
    leadCreate.mockReset();
    leadCount.mockReset();
    leadCount.mockResolvedValue(0);
    leadFindMany.mockReset();
    leadFindMany.mockResolvedValue([]);
    leadFindFirst.mockReset();
  });

  function acceptApiKey(): void {
    verifyApiKey.mockResolvedValue({
      valid: true,
      error: null,
      key: { id: 'key-a', referenceId: 'organization-a' },
    });
  }

  it('allows explicitly anonymous routes', async () => {
    await request(app.getHttpServer())
      .get('/api/v1')
      .expect(200)
      .expect('Hello World!');
  });

  it('rejects unauthenticated protected routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/api-keys').expect(401);
  });

  it('no longer serves the retired users routes', async () => {
    await request(app.getHttpServer()).get('/api/v1/users').expect(404);
    await request(app.getHttpServer()).get('/api/v1/users/user-a').expect(404);
  });

  it('rejects lead reads without a session or an API key', async () => {
    await request(app.getHttpServer()).get('/api/v1/leads').expect(401);
    await request(app.getHttpServer()).get('/api/v1/leads/lead-a').expect(401);

    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('lets an API key read leads in its own organization', async () => {
    acceptApiKey();
    const createdAt = new Date('2026-09-13T10:00:00.000Z');
    leadFindFirst.mockResolvedValue({
      id: 'lead-a',
      createdAt,
      updatedAt: createdAt,
      values: [{ fieldId: 'field-status', value: 'new' }],
    });

    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .set('x-api-key', 'cms_valid')
      .expect(200)
      .expect({
        data: [],
        meta: { total: 0, page: 1, limit: 10, lastPage: 1 },
      });
    await request(app.getHttpServer())
      .get('/api/v1/leads/lead-a')
      .set('x-api-key', 'cms_valid')
      .expect(200);

    expect(leadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a', isArchived: false },
      }),
    );
    expect(leadFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'lead-a', organizationId: 'organization-a' },
      }),
    );
  });

  it('looks up leads by an exact field value for dedupe', async () => {
    acceptApiKey();

    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .query({ field: 'candidate', value: 'Dana Reyes', limit: 1 })
      .set('x-api-key', 'cms_valid')
      .expect(200);

    expect(leadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          isArchived: false,
          AND: [
            {
              values: {
                some: {
                  fieldId: 'field-candidate',
                  value: { equals: 'Dana Reyes' },
                },
              },
            },
          ],
        },
        take: 1,
      }),
    );
  });

  it('refuses a lookup on a field the organization does not have', async () => {
    acceptApiKey();

    const response = await request(app.getHttpServer())
      .get('/api/v1/leads')
      .query({ field: 'externalId', value: 'fb-123' })
      .set('x-api-key', 'cms_valid')
      .expect(400);

    expect((response.body as { message: string[] }).message).toEqual([
      'field externalId is not a lead field',
    ]);
    expect(leadFindMany).not.toHaveBeenCalled();
  });

  it('rejects API key minting without a session', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/api-keys')
      .send({ name: 'postman' })
      .expect(401);
  });

  it('rejects lead ingest without an API key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/leads')
      .send({ values: { candidate: 'Dana Reyes' } })
      .expect(401);

    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('rejects lead ingest with an unknown API key', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('x-api-key', 'cms_unknown')
      .send({ values: { candidate: 'Dana Reyes' } })
      .expect(401);

    expect(verifyApiKey).toHaveBeenCalled();
  });

  it('refuses lead ingest with keys that are not lead fields', async () => {
    acceptApiKey();

    const response = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('x-api-key', 'cms_valid')
      .send({ values: { candidate: 'Dana Reyes', budget: 5000 } })
      .expect(400);

    expect((response.body as { message: string[] }).message).toEqual([
      'values.budget is not a lead field',
    ]);
    expect(leadCreate).not.toHaveBeenCalled();
  });

  it('files a lead with known keys under the API key organization', async () => {
    acceptApiKey();
    const createdAt = new Date('2026-09-13T10:00:00.000Z');
    leadCreate.mockResolvedValue({
      id: 'lead-a',
      createdAt,
      updatedAt: createdAt,
      values: [
        { fieldId: 'field-candidate', value: 'Dana Reyes' },
        { fieldId: 'field-status', value: 'new' },
      ],
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('x-api-key', 'cms_valid')
      .send({ values: { candidate: 'Dana Reyes' } })
      .expect(201);

    expect(response.body).toEqual({
      id: 'lead-a',
      values: { candidate: 'Dana Reyes', status: 'new' },
      createdAt: createdAt.toISOString(),
      updatedAt: createdAt.toISOString(),
    });
    expect(fieldDefinitionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a', collection: 'lead' },
      }),
    );
  });

  it('rejects lead field reads without a session or an API key', async () => {
    const response = await request(app.getHttpServer())
      .get('/api/v1/leads/fields')
      .expect(401);

    expect((response.body as { message: string }).message).toBe(
      'Unauthorized',
    );
    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('serves lead fields to an API key, not to the lead detail route', async () => {
    acceptApiKey();

    const response = await request(app.getHttpServer())
      .get('/api/v1/leads/fields')
      .set('x-api-key', 'cms_valid')
      .expect(200);

    expect(response.body).toEqual(leadFields);
    expect(fieldDefinitionFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a', collection: 'lead' },
      }),
    );
  });

  it('never lets an API key manage lead fields', async () => {
    acceptApiKey();

    await request(app.getHttpServer())
      .post('/api/v1/leads/fields')
      .set('x-api-key', 'cms_valid')
      .send({ key: 'dealSize', label: 'Deal size', type: 'number' })
      .expect(401);
    await request(app.getHttpServer())
      .delete('/api/v1/leads/fields/field-a')
      .set('x-api-key', 'cms_valid')
      .expect(401);

    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('never lets an API key edit lead values', async () => {
    acceptApiKey();

    await request(app.getHttpServer())
      .patch('/api/v1/leads/lead-a')
      .set('x-api-key', 'cms_valid')
      .send({ values: { note: 'Hi' } })
      .expect(401);

    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('rejects lead status changes without a session', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/leads/lead-a/status')
      .send({ status: 'contacted' })
      .expect(401);
  });

  it('never lets an API key change a lead status', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/leads/lead-a/status')
      .set('x-api-key', 'cms_unknown')
      .send({ status: 'contacted' })
      .expect(401);

    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('never lets an API key archive a lead', async () => {
    await request(app.getHttpServer())
      .patch('/api/v1/leads/lead-a/archive')
      .send({ isArchived: true })
      .expect(401);
    await request(app.getHttpServer())
      .patch('/api/v1/leads/lead-a/archive')
      .set('x-api-key', 'cms_unknown')
      .send({ isArchived: true })
      .expect(401);

    expect(verifyApiKey).not.toHaveBeenCalled();
  });

  it('reads the archive as its own list, never mixed into the inbox', async () => {
    acceptApiKey();

    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .query({ archived: 'true' })
      .set('x-api-key', 'cms_valid')
      .expect(200);

    expect(leadFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a', isArchived: true },
      }),
    );
  });

  it('refuses an archived filter that is not true or false', async () => {
    acceptApiKey();

    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .query({ archived: 'yes' })
      .set('x-api-key', 'cms_valid')
      .expect(400);
  });

  afterAll(async () => {
    await app.close();
  });
});
