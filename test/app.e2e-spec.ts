import { createHash } from 'node:crypto';

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

const PUBLIC_KEY = 'pub_e2e-key';
const PUBLIC_KEY_HASH = createHash('sha256').update(PUBLIC_KEY).digest('hex');

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
  const organizationFindUnique = jest.fn();
  const blogAccessFindUnique = jest.fn();
  const postCount = jest.fn();
  const postFindMany = jest.fn();
  const postFindFirst = jest.fn();
  const postCreate = jest.fn();
  const categoryFindMany = jest.fn();
  const tagFindMany = jest.fn();

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
        organization: { findUnique: organizationFindUnique },
        blogAccess: { findUnique: blogAccessFindUnique },
        post: {
          count: postCount,
          findMany: postFindMany,
          findFirst: postFindFirst,
          create: postCreate,
        },
        category: { findMany: categoryFindMany },
        tag: { findMany: tagFindMany },
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
    organizationFindUnique.mockReset();
    organizationFindUnique.mockResolvedValue({ id: 'organization-a', slug: 'acme' });
    blogAccessFindUnique.mockReset();
    blogAccessFindUnique.mockResolvedValue({ publicKeyHash: PUBLIC_KEY_HASH });
    postCount.mockReset();
    postCount.mockResolvedValue(0);
    postFindMany.mockReset();
    postFindMany.mockResolvedValue([]);
    postFindFirst.mockReset();
    postFindFirst.mockResolvedValue(null);
    postCreate.mockReset();
    categoryFindMany.mockReset();
    categoryFindMany.mockResolvedValue([]);
    tagFindMany.mockReset();
    tagFindMany.mockResolvedValue([]);
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

  describe('blog', () => {
    const publishedAt = new Date('2026-09-24T08:00:00.000Z');

    it('no longer serves the content routes', async () => {
      await request(app.getHttpServer()).get('/api/v1/content').expect(404);
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/content')
        .set('x-public-key', PUBLIC_KEY)
        .expect(404);
    });

    it('refuses the public blog without the public key', async () => {
      await request(app.getHttpServer()).get('/api/v1/public/acme/blog/posts').expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts')
        .set('x-public-key', 'pub_wrong')
        .expect(401);

      expect(postFindMany).not.toHaveBeenCalled();
    });

    it('lists published posts in a category and with a tag, never drafts', async () => {
      postCount.mockResolvedValue(1);
      postFindMany.mockResolvedValue([
        {
          id: 'post-1',
          title: 'Spring openings',
          slug: 'spring-openings',
          excerpt: 'Roles we are hiring for.',
          status: 'published',
          publishedAt,
          updatedAt: publishedAt,
          coverImage: null,
          category: { id: 'category-1', name: 'News', slug: 'news' },
          tags: [{ tag: { id: 'tag-1', name: 'Hiring', slug: 'hiring' } }],
        },
      ]);

      const response = await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts')
        .query({ category: 'news', tag: 'hiring' })
        .set('x-public-key', PUBLIC_KEY)
        .expect(200)
        .expect('Cache-Control', 'public, max-age=60');

      const where = {
        organizationId: 'organization-a',
        status: 'published',
        category: { is: { slug: 'news' } },
        tags: { some: { tag: { slug: 'hiring' } } },
      };
      expect(postCount).toHaveBeenCalledWith({ where });
      expect(postFindMany).toHaveBeenCalledWith(expect.objectContaining({ where }));
      expect(response.body).toEqual({
        data: [
          {
            title: 'Spring openings',
            slug: 'spring-openings',
            excerpt: 'Roles we are hiring for.',
            publishedAt: publishedAt.toISOString(),
            coverImage: null,
            category: { name: 'News', slug: 'news' },
            tags: [{ name: 'Hiring', slug: 'hiring' }],
          },
        ],
        meta: { total: 1, page: 1, limit: 10, lastPage: 1 },
      });
    });

    it('refuses a filter that is not a slug', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts')
        .query({ category: 'Big News' })
        .set('x-public-key', PUBLIC_KEY)
        .expect(400);
    });

    it('answers 404 for a slug that is not published', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts/still-a-draft')
        .set('x-public-key', PUBLIC_KEY)
        .expect(404);

      expect(postFindFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'organization-a',
            slug: 'still-a-draft',
            status: 'published',
          },
        }),
      );
    });

    it('lists categories and tags that have published posts', async () => {
      categoryFindMany.mockResolvedValue([
        { name: 'News', slug: 'news', _count: { posts: 2 } },
      ]);
      tagFindMany.mockResolvedValue([
        { name: 'Hiring', slug: 'hiring', _count: { posts: 1 } },
      ]);

      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/categories')
        .set('x-public-key', PUBLIC_KEY)
        .expect(200)
        .expect([{ name: 'News', slug: 'news', postCount: 2 }]);
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/tags')
        .set('x-public-key', PUBLIC_KEY)
        .expect(200)
        .expect([{ name: 'Hiring', slug: 'hiring', postCount: 1 }]);

      expect(categoryFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'organization-a', posts: { some: { status: 'published' } } },
        }),
      );
    });

    it('lets an API key file a draft with a slug from its title', async () => {
      acceptApiKey();
      postCreate.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
        Promise.resolve({
          id: 'post-1',
          organizationId: data.organizationId,
          title: data.title,
          slug: data.slug,
          hasCustomSlug: data.hasCustomSlug,
          excerpt: data.excerpt,
          metaTitle: data.metaTitle,
          metaDescription: data.metaDescription,
          ogImage: null,
          coverImage: null,
          category: null,
          tags: [],
          status: data.status,
          publishedAt: data.publishedAt,
          blocks: data.blocks,
          createdAt: publishedAt,
          updatedAt: publishedAt,
        }),
      );

      const response = await request(app.getHttpServer())
        .post('/api/v1/blog/posts')
        .set('x-api-key', 'cms_valid')
        .send({ title: 'Agent notes' })
        .expect(201);

      expect(response.body).toMatchObject({
        slug: 'agent-notes',
        hasCustomSlug: false,
        status: 'draft',
      });
      expect(postCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'organization-a' }) as unknown,
        }),
      );
    });

    it('never lets an API key publish or manage categories and tags', async () => {
      acceptApiKey();

      await request(app.getHttpServer())
        .post('/api/v1/blog/posts/post-1/publish')
        .set('x-api-key', 'cms_valid')
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/blog/categories')
        .set('x-api-key', 'cms_valid')
        .send({ name: 'News' })
        .expect(401);
      await request(app.getHttpServer())
        .delete('/api/v1/blog/tags/tag-1')
        .set('x-api-key', 'cms_valid')
        .expect(401);

      expect(verifyApiKey).not.toHaveBeenCalled();
    });

    it('lets an API key read the categories it can file under', async () => {
      acceptApiKey();
      categoryFindMany.mockResolvedValue([
        { id: 'category-1', name: 'News', slug: 'news', _count: { posts: 4 } },
      ]);

      await request(app.getHttpServer())
        .get('/api/v1/blog/categories')
        .set('x-api-key', 'cms_valid')
        .expect(200)
        .expect([{ id: 'category-1', name: 'News', slug: 'news', postCount: 4 }]);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
