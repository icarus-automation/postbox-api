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
    id: 'field-why-lead',
    key: 'whyLead',
    label: 'Why this is a lead',
    type: FieldType.long_text,
    options: [],
    isRequired: false,
    isReadOnly: false,
    isSystem: true,
    position: 1,
  },
  {
    id: 'field-email',
    key: 'email',
    label: 'Email',
    type: FieldType.text,
    options: [],
    isRequired: false,
    isReadOnly: false,
    isSystem: true,
    position: 2,
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
    position: 3,
  },
];

const AGENT_REASON = 'Asked for a POS in a group post.';

const INTEGRATION_KEY = 'pbi_e2e-key';

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
  const leadUpdate = jest.fn();
  const queryRaw = jest.fn();
  const integrationKeyFindFirst = jest.fn();
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
          update: leadUpdate,
        },
        $queryRaw: queryRaw,
        integrationKey: { findFirst: integrationKeyFindFirst },
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
    leadUpdate.mockReset();
    // No lead shares the email or phone unless a test says so.
    queryRaw.mockReset();
    queryRaw.mockResolvedValue([]);
    // Holds INTEGRATION_KEY for the organization with the slug acme and no other key.
    integrationKeyFindFirst.mockReset();
    integrationKeyFindFirst.mockImplementation(
      ({ where }: { where: { key: string; organization?: { slug: string } } }) =>
        Promise.resolve(
          where.key === INTEGRATION_KEY &&
            (where.organization === undefined || where.organization.slug === 'acme')
            ? { organizationId: 'organization-a' }
            : null,
        ),
    );
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
      channel: 'form',
      createdAt,
      updatedAt: createdAt,
      values: [{ fieldId: 'field-status', value: 'new' }],
      submissions: [],
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
      .send({
        values: { candidate: 'Dana Reyes', whyLead: AGENT_REASON, budget: 5000 },
      })
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
      channel: 'agent',
      createdAt,
      updatedAt: createdAt,
      values: [
        { fieldId: 'field-candidate', value: 'Dana Reyes' },
        { fieldId: 'field-why-lead', value: AGENT_REASON },
        { fieldId: 'field-status', value: 'new' },
      ],
      submissions: [],
    });

    const response = await request(app.getHttpServer())
      .post('/api/v1/leads')
      .set('x-api-key', 'cms_valid')
      .send({ values: { candidate: 'Dana Reyes', whyLead: AGENT_REASON } })
      .expect(201);

    expect(response.body).toEqual({
      id: 'lead-a',
      channel: 'agent',
      nowInbound: false,
      values: {
        candidate: 'Dana Reyes',
        whyLead: AGENT_REASON,
        email: null,
        status: 'new',
      },
      submissions: [],
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

  it('lists leads by channel, with inbound taking in prospects that sent the form', async () => {
    acceptApiKey();

    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .query({ channel: 'form' })
      .set('x-api-key', 'cms_valid')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .query({ channel: 'agent' })
      .set('x-api-key', 'cms_valid')
      .expect(200);
    await request(app.getHttpServer())
      .get('/api/v1/leads')
      .query({ channel: 'email' })
      .set('x-api-key', 'cms_valid')
      .expect(400);

    expect(leadFindMany).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          isArchived: false,
          OR: [
            { channel: 'form' },
            { submissions: { some: { channel: 'form' } } },
          ],
        },
      }),
    );
    expect(leadFindMany).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          isArchived: false,
          channel: 'agent',
        },
      }),
    );
    expect(leadFindMany).toHaveBeenCalledTimes(2);
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
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(404);
    });

    it('refuses the public blog without the integration key', async () => {
      await request(app.getHttpServer()).get('/api/v1/public/acme/blog/posts').expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts')
        .set('x-integration-key', 'pbi_wrong')
        .expect(401);

      expect(postFindMany).not.toHaveBeenCalled();
    });

    it('refuses the key of another organization, an admin API key, and the old header', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/public/other-org/blog/posts')
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts')
        .set('x-api-key', 'cms_valid')
        .expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts')
        .set('x-public-key', INTEGRATION_KEY)
        .expect(401);

      expect(postFindMany).not.toHaveBeenCalled();
      expect(verifyApiKey).not.toHaveBeenCalled();
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
        .set('x-integration-key', INTEGRATION_KEY)
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
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(400);
    });

    it('returns a post with every block type as ordered blocks and sanitized html', async () => {
      const photo = {
        id: 'media-1',
        url: 'https://media.example.com/team.png',
        alt: 'The "team" <b>photo</b>',
        contentType: 'image/png',
      };
      const prose = {
        type: 'doc',
        content: [
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'We are ' },
              { type: 'text', text: 'hiring', marks: [{ type: 'bold' }] },
              { type: 'text', text: '.' },
            ],
          },
        ],
      };
      postFindFirst.mockResolvedValue({
        id: 'post-1',
        organizationId: 'organization-a',
        title: 'Spring openings',
        slug: 'spring-openings',
        hasCustomSlug: false,
        excerpt: 'Roles we are hiring for.',
        metaTitle: '',
        metaDescription: '',
        ogImage: null,
        coverImage: null,
        category: null,
        tags: [],
        status: 'published',
        publishedAt,
        updatedAt: publishedAt,
        blocks: [
          { id: 'b1', kind: 'heading', level: 2, text: 'Open <roles>' },
          { id: 'b2', kind: 'rich_text', doc: prose, html: '<p>We are <strong>hiring</strong>.</p>' },
          { id: 'b3', kind: 'image', image: { media: photo } },
          {
            id: 'b4',
            kind: 'media_text',
            side: 'image_left',
            image: { media: photo },
            heading: 'Why join us',
            doc: prose,
            html: '<p>We are <strong>hiring</strong>.</p>',
          },
          { id: 'b5', kind: 'divider' },
        ],
      });

      const response = await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts/spring-openings')
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(200)
        .expect('Cache-Control', 'public, max-age=60');

      const body = response.body as {
        blocks: Array<{ kind: string }>;
        html: string;
        title: string;
      };
      expect(body.title).toBe('Spring openings');
      expect(body.blocks.map((block) => block.kind)).toEqual([
        'heading',
        'rich_text',
        'image',
        'media_text',
        'divider',
      ]);
      expect(body.html).toBe(
        [
          '<h2 class="pb-heading">Open &lt;roles&gt;</h2>',
          '<div class="pb-rich-text"><p>We are <strong>hiring</strong>.</p></div>',
          '<figure class="pb-image"><img src="https://media.example.com/team.png" alt="The &quot;team&quot; &lt;b&gt;photo&lt;/b&gt;" loading="lazy" /></figure>',
          '<div class="pb-media-text pb-media-text--image-left">' +
            '<figure class="pb-media-text__media"><img src="https://media.example.com/team.png" alt="The &quot;team&quot; &lt;b&gt;photo&lt;/b&gt;" loading="lazy" /></figure>' +
            '<div class="pb-media-text__body"><h2 class="pb-media-text__heading">Why join us</h2><p>We are <strong>hiring</strong>.</p></div>' +
            '</div>',
          '<hr class="pb-divider" />',
        ].join('\n'),
      );
    });

    it('answers 404 for a slug that is not published', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/posts/still-a-draft')
        .set('x-integration-key', INTEGRATION_KEY)
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
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(200)
        .expect([{ name: 'News', slug: 'news', postCount: 2 }]);
      await request(app.getHttpServer())
        .get('/api/v1/public/acme/blog/tags')
        .set('x-integration-key', INTEGRATION_KEY)
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

  describe('integration key', () => {
    const createdAt = new Date('2026-10-25T10:00:00.000Z');
    const values = { candidate: 'Dana Reyes' };

    function storeLead(channel: 'form' | 'agent' = 'form'): void {
      leadCreate.mockResolvedValue({
        id: 'lead-a',
        channel,
        createdAt,
        updatedAt: createdAt,
        values: [
          { fieldId: 'field-candidate', value: 'Dana Reyes' },
          { fieldId: 'field-status', value: 'new' },
        ],
        submissions: [],
      });
    }

    it('files a lead through the public route and answers with its id only', async () => {
      storeLead();

      const response = await request(app.getHttpServer())
        .post('/api/v1/public/acme/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ values })
        .expect(201);

      expect(response.body).toEqual({ id: 'lead-a' });
      expect(leadCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ organizationId: 'organization-a' }) as unknown,
        }),
      );
      expect(verifyApiKey).not.toHaveBeenCalled();
    });

    it('files a lead through POST /leads too, answering with the whole lead', async () => {
      storeLead();

      const response = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ values })
        .expect(201);

      expect(response.body).toEqual({
        id: 'lead-a',
        channel: 'form',
        nowInbound: false,
        values: {
          candidate: 'Dana Reyes',
          whyLead: null,
          email: null,
          status: 'new',
        },
        submissions: [],
        createdAt: createdAt.toISOString(),
        updatedAt: createdAt.toISOString(),
      });
      expect(verifyApiKey).not.toHaveBeenCalled();
    });

    it('still files a lead for an admin API key beside it', async () => {
      acceptApiKey();
      storeLead('agent');

      await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('x-api-key', 'cms_valid')
        .send({ values: { ...values, whyLead: AGENT_REASON } })
        .expect(201);

      expect(verifyApiKey).toHaveBeenCalled();
      expect(integrationKeyFindFirst).not.toHaveBeenCalled();
    });

    it('refuses a lead from a key that is wrong, rotated away, or another organization', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/public/acme/leads')
        .send({ values })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/public/acme/leads')
        .set('x-integration-key', 'pbi_rotated-away')
        .send({ values })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/public/other-org/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ values })
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('x-integration-key', 'pbi_rotated-away')
        .send({ values })
        .expect(401);

      expect(leadCreate).not.toHaveBeenCalled();
    });

    it('lists every problem with the lead values in one 400', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/v1/public/acme/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ values: { budget: 5000 } })
        .expect(400);

      expect((response.body as { message: string[] }).message).toEqual([
        'values.budget is not a lead field',
        'values.candidate is required',
      ]);
      expect(leadCreate).not.toHaveBeenCalled();
    });

    it('files a form lead for the integration key, whatever channel the body names', async () => {
      storeLead();

      await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ channel: 'agent', values })
        .expect(201);
      await request(app.getHttpServer())
        .post('/api/v1/public/acme/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ channel: 'agent', values })
        .expect(201);

      expect(leadCreate).toHaveBeenCalledTimes(2);
      for (const [args] of leadCreate.mock.calls as [{ data: { channel: string } }][]) {
        expect(args.data.channel).toBe('form');
      }
    });

    it('files an agent lead for an admin API key, whatever channel the body names', async () => {
      acceptApiKey();
      storeLead('agent');

      await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('x-api-key', 'cms_valid')
        .send({ channel: 'form', values: { ...values, whyLead: AGENT_REASON } })
        .expect(201);

      expect(leadCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ channel: 'agent' }) as unknown,
        }),
      );
    });

    it('refuses an admin API key lead without a reason, saying why', async () => {
      acceptApiKey();

      const response = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('x-api-key', 'cms_valid')
        .send({ values })
        .expect(400);

      expect((response.body as { message: string[] }).message).toEqual([
        'values.whyLead is required on agent leads, which an admin API key files',
      ]);
      expect(leadCreate).not.toHaveBeenCalled();
    });

    it('drops the boilerplate reason a website form still sends', async () => {
      storeLead();

      await request(app.getHttpServer())
        .post('/api/v1/public/acme/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({
          values: { ...values, whyLead: 'Contact form on https://acme.example' },
        })
        .expect(201);

      const [[args]] = leadCreate.mock.calls as [
        { data: { values: { create: { fieldId: string }[] } } },
      ][];
      expect(args.data.values.create.map(({ fieldId }) => fieldId)).toEqual([
        'field-candidate',
        'field-status',
      ]);
    });

    it('attaches a repeat by email to the lead it matches, and flags a prospect now inbound', async () => {
      queryRaw.mockResolvedValue([{ id: 'lead-a', channel: 'agent' }]);
      leadUpdate.mockResolvedValue({
        id: 'lead-a',
        channel: 'agent',
        isArchived: false,
        createdAt,
        updatedAt: createdAt,
        values: [
          { fieldId: 'field-candidate', value: 'Dana Reyes' },
          { fieldId: 'field-email', value: 'dana@acme.example' },
          { fieldId: 'field-status', value: 'new' },
        ],
        submissions: [
          {
            id: 'submission-a',
            channel: 'form',
            values: { candidate: 'Dana Reyes', email: 'Dana@Acme.example' },
            createdAt,
          },
        ],
      });

      const response = await request(app.getHttpServer())
        .post('/api/v1/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ values: { ...values, email: 'Dana@Acme.example' } })
        .expect(201);

      expect(leadCreate).not.toHaveBeenCalled();
      expect(leadUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'lead-a' } }),
      );
      expect(response.body).toEqual(
        expect.objectContaining({
          id: 'lead-a',
          channel: 'agent',
          nowInbound: true,
          submissions: [
            {
              id: 'submission-a',
              channel: 'form',
              values: { candidate: 'Dana Reyes', email: 'Dana@Acme.example' },
              createdAt: createdAt.toISOString(),
            },
          ],
        }),
      );
    });

    it('turns the key away from every lead read with a 403', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/leads')
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/leads/lead-a')
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/leads/fields')
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(403);

      expect(leadFindMany).not.toHaveBeenCalled();
      expect(leadFindFirst).not.toHaveBeenCalled();
      expect(fieldDefinitionFindMany).not.toHaveBeenCalled();
    });

    it('turns the key away from drafts and the admin blog reads with a 403', async () => {
      await request(app.getHttpServer())
        .post('/api/v1/blog/posts')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ title: 'Sneaky draft' })
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/blog/posts')
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(403);
      await request(app.getHttpServer())
        .patch('/api/v1/blog/posts/post-1')
        .set('x-integration-key', INTEGRATION_KEY)
        .send({ title: 'Edited' })
        .expect(403);
      await request(app.getHttpServer())
        .get('/api/v1/blog/categories')
        .set('x-integration-key', INTEGRATION_KEY)
        .expect(403);

      expect(postCreate).not.toHaveBeenCalled();
      expect(postFindMany).not.toHaveBeenCalled();
      expect(categoryFindMany).not.toHaveBeenCalled();
    });

    it('reads a 401 on those routes once the key is rotated away', async () => {
      await request(app.getHttpServer())
        .get('/api/v1/leads')
        .set('x-integration-key', 'pbi_rotated-away')
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/blog/posts')
        .set('x-integration-key', 'pbi_rotated-away')
        .send({ title: 'Draft' })
        .expect(401);
    });

    it('cannot publish, change a lead, or touch the key, as an admin API key cannot', async () => {
      const headers = { 'x-integration-key': INTEGRATION_KEY };

      await request(app.getHttpServer())
        .post('/api/v1/blog/posts/post-1/publish')
        .set(headers)
        .expect(401);
      await request(app.getHttpServer())
        .patch('/api/v1/leads/lead-a/status')
        .set(headers)
        .send({ status: 'qualified' })
        .expect(401);
      await request(app.getHttpServer()).get('/api/v1/integration-key').set(headers).expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/integration-key/rotate')
        .set(headers)
        .expect(401);
    });

    it('is read and rotated by a signed-in owner or admin only', async () => {
      acceptApiKey();

      await request(app.getHttpServer()).get('/api/v1/integration-key').expect(401);
      await request(app.getHttpServer()).post('/api/v1/integration-key/rotate').expect(401);
      await request(app.getHttpServer())
        .get('/api/v1/integration-key')
        .set('x-api-key', 'cms_valid')
        .expect(401);
      await request(app.getHttpServer())
        .post('/api/v1/integration-key/rotate')
        .set('x-api-key', 'cms_valid')
        .expect(401);
    });

    it('serves the integration guide to anyone, as plain text', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/v1/docs/integration.md')
        .expect(200)
        .expect('Content-Type', 'text/plain; charset=utf-8');

      const guide = response.text;
      expect(guide).toContain('# Postbox integration guide');
      expect(guide).toContain('/api/v1/docs/integration.md');
      expect(guide).toContain('x-integration-key');
      expect(guide).not.toContain('{{apiBaseUrl}}');
      expect(verifyApiKey).not.toHaveBeenCalled();
      expect(integrationKeyFindFirst).not.toHaveBeenCalled();
    });

    it('caps lead submit at ten a minute for one address', async () => {
      storeLead();
      const statuses: number[] = [];

      for (let attempt = 0; attempt < 12; attempt += 1) {
        const response = await request(app.getHttpServer())
          .post('/api/v1/public/acme/leads')
          .set('x-integration-key', INTEGRATION_KEY)
          .send({ values });
        statuses.push(response.status);
      }

      expect(statuses).toContain(429);
      expect(statuses.filter((status) => status === 201).length).toBeLessThanOrEqual(10);
    });
  });

  afterAll(async () => {
    await app.close();
  });
});
