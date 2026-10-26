import { Prisma } from '@prisma/client';
import { mock, mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import { BlogWebhook } from './blog-webhook.service';
import { DraftRejected } from './document/blog.types';
import { MediaService } from './media.service';
import { PostsService } from './posts.service';

const updatedAt = new Date('2026-09-24T08:00:00.000Z');
const publishedAt = new Date('2026-09-24T09:00:00.000Z');

const NEWS = { id: '01928c4e-0000-7000-8000-000000000001', name: 'News', slug: 'news' };
const LAUNCH = { id: '01928c4e-0000-7000-8000-000000000002', name: 'Launch', slug: 'launch' };
const HIRING = { id: '01928c4e-0000-7000-8000-000000000003', name: 'Hiring', slug: 'hiring' };
const TERMS = new Map([NEWS, LAUNCH, HIRING].map((term) => [term.id, term]));

function storedPost(overrides: Record<string, unknown> = {}) {
  return {
    id: 'post-1',
    organizationId: 'organization-a',
    title: 'Spring openings',
    slug: 'spring-openings',
    hasCustomSlug: false,
    excerpt: '',
    metaTitle: '',
    metaDescription: '',
    ogImageId: null,
    coverImageId: null,
    categoryId: null,
    ogImage: null,
    coverImage: null,
    category: null,
    tags: [] as Array<{ tag: typeof NEWS }>,
    status: 'draft',
    publishedAt: null,
    blocks: [],
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

// What the database hands back after a write: the row as it was, with the
// written columns on top and the relations the ids point at.
function afterWrite(
  data: Record<string, unknown>,
  base: Record<string, unknown> = storedPost(),
) {
  const categoryId = 'categoryId' in data ? (data.categoryId as string | null) : null;
  const created = (data.tags as { create?: Array<{ tagId: string }> } | undefined)?.create;
  return {
    ...base,
    ...data,
    category: categoryId ? TERMS.get(categoryId) : null,
    tags: created ? created.map((link) => ({ tag: TERMS.get(link.tagId) })) : base.tags,
  };
}

const PHOTO = {
  id: 'media-1',
  url: 'https://media.example.com/team.png',
  alt: 'The team',
  contentType: 'image/png',
};

const PARAGRAPH = {
  type: 'doc',
  content: [{ type: 'paragraph', content: [{ type: 'text', text: 'We are hiring.' }] }],
};

// A stored post body with one of every block kind.
const EVERY_BLOCK = [
  { id: 'block-1', kind: 'heading', level: 2, text: 'Open roles' },
  { id: 'block-2', kind: 'rich_text', doc: PARAGRAPH, html: '<p>We are hiring.</p>' },
  { id: 'block-3', kind: 'image', image: { media: PHOTO } },
  {
    id: 'block-4',
    kind: 'media_text',
    side: 'image_right',
    image: { media: PHOTO },
    heading: 'Why join us',
    doc: PARAGRAPH,
    html: '<p>We are hiring.</p>',
  },
  { id: 'block-5', kind: 'divider' },
];

const EVERY_CLASS = [
  'pb-heading',
  'pb-rich-text',
  'pb-image',
  'pb-media-text',
  'pb-media-text__body',
  'pb-media-text__media',
  'pb-divider',
];

function uniqueSlugViolation() {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: 'test',
    meta: {
      driverAdapterError: {
        cause: { constraint: { index: 'posts_organization_id_slug_key' } },
      },
    },
  });
}

describe('PostsService', () => {
  const prisma = mockDeep<PrismaService>();
  const media = mock<MediaService>();
  const webhooks = mock<BlogWebhook>();
  const service = new PostsService(prisma, media, webhooks);

  const { create, update, findFirst, findMany } = prisma.post;

  const flush = () => new Promise((resolve) => setImmediate(resolve));

  beforeEach(() => {
    mockReset(prisma);
    mockReset(media);
    mockReset(webhooks);
    media.indexFor.mockResolvedValue(new Map());
    findMany.mockResolvedValue([]);
    prisma.organization.findUnique.mockResolvedValue({
      id: 'organization-a',
      slug: 'acme',
    } as never);
    prisma.blogAccess.findUnique.mockResolvedValue({
      webhookUrl: 'https://hooks.example/cms',
      webhookSecret: 'sekret',
    } as never);
    prisma.category.findFirst.mockImplementation(((args: { where: { id: string } }) =>
      Promise.resolve(TERMS.get(args.where.id) ?? null)) as never);
    prisma.tag.findMany.mockImplementation(((args: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        args.where.id.in.flatMap((id) => (TERMS.has(id) ? [TERMS.get(id)] : [])),
      )) as never);
    webhooks.deliver.mockResolvedValue(undefined);
    create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve(afterWrite(args.data))) as never);
  });

  function writesOver(row: Record<string, unknown>) {
    findFirst.mockResolvedValue(row as never);
    update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve(afterWrite(args.data, row))) as never);
  }

  describe('slugs', () => {
    it('makes a new draft slug from the title and starts it with one text block', async () => {
      const post = await service.createDraft('organization-a', { title: 'Café opening!' });

      expect(post).toMatchObject({
        slug: 'cafe-opening',
        hasCustomSlug: false,
        status: 'draft',
        publishedAt: null,
      });
      expect(post.blocks).toEqual([
        expect.objectContaining({ kind: 'rich_text', html: '<p></p>' }),
      ]);
      expect(create.mock.calls[0]?.[0].data).toMatchObject({
        organizationId: 'organization-a',
        title: 'Café opening!',
        slug: 'cafe-opening',
        hasCustomSlug: false,
        status: 'draft',
      });
    });

    it('gives a duplicate title the next free number', async () => {
      findMany.mockResolvedValue([
        { slug: 'spring-openings' },
        { slug: 'spring-openings-2' },
        { slug: 'spring-openings-team' },
      ] as never);

      const post = await service.createDraft('organization-a', { title: 'Spring openings' });

      expect(post.slug).toBe('spring-openings-3');
      expect(findMany).toHaveBeenCalledWith({
        where: { organizationId: 'organization-a', slug: { startsWith: 'spring-openings' } },
        select: { slug: true },
      });
    });

    it('reads the taken slugs again when another write takes the slug first', async () => {
      findMany
        .mockResolvedValueOnce([] as never)
        .mockResolvedValueOnce([{ slug: 'spring-openings' }] as never);
      create.mockRejectedValueOnce(uniqueSlugViolation());

      const post = await service.createDraft('organization-a', { title: 'Spring openings' });

      expect(post.slug).toBe('spring-openings-2');
      expect(create).toHaveBeenCalledTimes(2);
    });

    it('gives an API key draft the same slug from the title as the editor', async () => {
      const post = await service.createDraft('organization-a', {
        title: 'Agent draft',
        blocks: [{ kind: 'rich_text', markdown: 'Hello' }],
      });

      expect(post).toMatchObject({ slug: 'agent-draft', hasCustomSlug: false });
    });

    it('keeps a slug the body names as a slug a person chose', async () => {
      const post = await service.createDraft('organization-a', {
        title: 'Spring openings',
        slug: 'jobs',
      });

      expect(post).toMatchObject({ slug: 'jobs', hasCustomSlug: true });
    });

    it('falls back to post for a title with no letters or digits', async () => {
      const post = await service.createDraft('organization-a', { title: '!!!' });

      expect(post.slug).toBe('post');
    });

    it('moves a draft slug with its title', async () => {
      writesOver(storedPost());

      const post = await service.updateDraft('organization-a', 'post-1', {
        title: 'Summer openings',
      });

      expect(post).toMatchObject({ title: 'Summer openings', slug: 'summer-openings' });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: { not: 'post-1' } }) as unknown,
        }),
      );
    });

    it('stops following the title once a person sets the slug', async () => {
      writesOver(storedPost());
      const typed = await service.updateDraft('organization-a', 'post-1', { slug: 'jobs' });
      expect(typed).toMatchObject({ slug: 'jobs', hasCustomSlug: true });

      writesOver(storedPost({ slug: 'jobs', hasCustomSlug: true }));
      const retitled = await service.updateDraft('organization-a', 'post-1', {
        title: 'Summer openings',
      });

      expect(retitled).toMatchObject({
        title: 'Summer openings',
        slug: 'jobs',
        hasCustomSlug: true,
      });
    });

    it('hands the slug back to the title when a person clears it', async () => {
      writesOver(storedPost({ slug: 'jobs', hasCustomSlug: true }));

      const post = await service.updateDraft('organization-a', 'post-1', { slug: null });

      expect(post).toMatchObject({ slug: 'spring-openings', hasCustomSlug: false });
    });

    it('keeps a published slug when the title changes', async () => {
      writesOver(storedPost({ status: 'published', publishedAt }));

      const post = await service.savePost('organization-a', 'post-1', {
        title: 'Spring openings revised',
        slug: null,
        blocks: [],
      });

      expect(post).toMatchObject({
        title: 'Spring openings revised',
        slug: 'spring-openings',
        status: 'published',
      });
    });

    it('changes a published slug only when a person types one', async () => {
      writesOver(storedPost({ status: 'published', publishedAt }));

      const post = await service.savePost('organization-a', 'post-1', {
        title: 'Spring openings',
        slug: 'careers',
        blocks: [],
      });

      expect(post).toMatchObject({ slug: 'careers', hasCustomSlug: true });
    });
  });

  describe('categories and tags', () => {
    it('files a new draft under a category with tags, sorted by name', async () => {
      const post = await service.createDraft('organization-a', {
        title: 'Spring openings',
        categoryId: NEWS.id,
        tagIds: [LAUNCH.id, HIRING.id],
      });

      expect(create.mock.calls[0]?.[0].data).toMatchObject({
        categoryId: NEWS.id,
        tags: { create: [{ tagId: HIRING.id }, { tagId: LAUNCH.id }] },
      });
      expect(post.category).toEqual(NEWS);
      expect(post.tags.map((tag) => tag.name)).toEqual(['Hiring', 'Launch']);
    });

    it('refuses a category or a tag the organization does not have', async () => {
      await expect(
        service.createDraft('organization-a', { title: 'A', categoryId: 'missing' }),
      ).rejects.toBeInstanceOf(DraftRejected);
      await expect(
        service.createDraft('organization-a', { title: 'A', tagIds: [NEWS.id, 'missing'] }),
      ).rejects.toBeInstanceOf(DraftRejected);
      expect(prisma.category.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'missing', organizationId: 'organization-a' } }),
      );
      expect(create).not.toHaveBeenCalled();
    });

    it('replaces the tags only when the write names them', async () => {
      writesOver(storedPost({ tags: [{ tag: LAUNCH }] }));

      await service.updateDraft('organization-a', 'post-1', { title: 'New title' });
      expect(update.mock.calls[0]?.[0].data).not.toHaveProperty('tags');

      await service.updateDraft('organization-a', 'post-1', { tagIds: [] });
      expect(update.mock.calls[1]?.[0].data).toMatchObject({
        tags: { deleteMany: {}, create: [] },
      });
    });

    it('tells the site when a published post changes category', async () => {
      writesOver(storedPost({ status: 'published', publishedAt }));

      await service.savePost('organization-a', 'post-1', {
        title: 'Spring openings',
        blocks: [],
        categoryId: NEWS.id,
      });
      await flush();

      expect(webhooks.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'post.updated',
          post: expect.objectContaining({
            category: { name: 'News', slug: 'news' },
          }) as unknown,
        }),
        expect.any(Object),
      );
    });

    it('announces the published posts a renamed category sits on', async () => {
      findMany.mockResolvedValue([
        storedPost({ status: 'published', publishedAt, category: NEWS, categoryId: NEWS.id }),
      ] as never);

      service.announceUpdatedPosts('organization-a', ['post-1']);
      await flush();
      await flush();

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { organizationId: 'organization-a', id: { in: ['post-1'] }, status: 'published' },
        }),
      );
      expect(webhooks.deliver).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'post.updated', organizationSlug: 'acme' }),
        { url: 'https://hooks.example/cms', secret: 'sekret' },
      );
    });
  });

  describe('publishing', () => {
    it('publishes a draft once and ignores a second publish', async () => {
      findFirst.mockResolvedValueOnce(storedPost() as never);
      update.mockResolvedValue(storedPost({ status: 'published', publishedAt }) as never);

      const published = await service.publishPost('organization-a', 'post-1', publishedAt);
      await flush();

      expect(published).toMatchObject({
        status: 'published',
        publishedAt: publishedAt.toISOString(),
      });
      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { status: 'published', publishedAt } }),
      );
      expect(webhooks.deliver).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'post.published',
          organizationSlug: 'acme',
          post: expect.objectContaining({
            slug: 'spring-openings',
            category: null,
            tags: [],
          }) as unknown,
        }),
        { url: 'https://hooks.example/cms', secret: 'sekret' },
      );

      findFirst.mockResolvedValueOnce(
        storedPost({ status: 'published', publishedAt }) as never,
      );
      webhooks.deliver.mockClear();
      await service.publishPost('organization-a', 'post-1', new Date());
      await flush();
      expect(webhooks.deliver).not.toHaveBeenCalled();
    });

    it('sends the rendered html with the post it announces', async () => {
      findFirst.mockResolvedValueOnce(storedPost({ blocks: EVERY_BLOCK }) as never);
      update.mockResolvedValue(
        storedPost({ status: 'published', publishedAt, blocks: EVERY_BLOCK }) as never,
      );

      await service.publishPost('organization-a', 'post-1', publishedAt);
      await flush();

      const event = webhooks.deliver.mock.calls[0]?.[0];
      expect(event?.post.blocks).toHaveLength(5);
      for (const name of EVERY_CLASS) expect(event?.post.html).toContain(name);
    });

    it('does not reject publish when the webhook throws', async () => {
      findFirst.mockResolvedValue(storedPost() as never);
      update.mockResolvedValue(storedPost({ status: 'published', publishedAt }) as never);
      webhooks.deliver.mockRejectedValue(new Error('down'));

      await expect(
        service.publishPost('organization-a', 'post-1', publishedAt),
      ).resolves.toMatchObject({ status: 'published' });
      await flush();
      expect(webhooks.deliver).toHaveBeenCalled();
    });

    it('unpublishes and still sends the slug and blocks', async () => {
      findFirst.mockResolvedValue(storedPost({ status: 'published', publishedAt }) as never);
      update.mockResolvedValue(storedPost({ status: 'draft', publishedAt: null }) as never);

      const post = await service.unpublishPost('organization-a', 'post-1');
      await flush();

      expect(post).toMatchObject({ status: 'draft', publishedAt: null });
      expect(webhooks.deliver.mock.calls[0]?.[0]).toMatchObject({
        type: 'post.unpublished',
        post: { slug: 'spring-openings', status: 'draft', blocks: [] },
      });
    });

    it('saves a published post and tells the site it changed', async () => {
      writesOver(storedPost({ status: 'published', publishedAt }));

      const post = await service.savePost('organization-a', 'post-1', {
        title: 'Spring openings revised',
        blocks: [{ kind: 'heading', level: 2, text: 'Hello' }],
      });
      await flush();

      expect(post).toMatchObject({
        status: 'published',
        publishedAt: publishedAt.toISOString(),
        title: 'Spring openings revised',
      });
      expect(webhooks.deliver).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'post.updated', organizationSlug: 'acme' }),
        expect.any(Object),
      );
    });

    it('stays quiet when a draft is saved', async () => {
      writesOver(storedPost());

      await service.savePost('organization-a', 'post-1', { title: 'Draft', blocks: [] });
      await flush();

      expect(webhooks.deliver).not.toHaveBeenCalled();
    });
  });

  describe('public reads', () => {
    it('returns the ordered blocks and the whole post rendered to html', async () => {
      findFirst.mockResolvedValue(
        storedPost({ status: 'published', publishedAt, blocks: EVERY_BLOCK }) as never,
      );

      const post = await service.getPublishedPost('organization-a', 'spring-openings');

      expect(post?.blocks.map((block) => block.kind)).toEqual([
        'heading',
        'rich_text',
        'image',
        'media_text',
        'divider',
      ]);
      const html = post?.html ?? '';
      for (const name of EVERY_CLASS) expect(html).toContain(name);
      const order = ['pb-heading', 'pb-rich-text', 'pb-image', 'pb-media-text ', 'pb-divider'];
      const positions = order.map((name) => html.indexOf(`class="${name.trim()}`));
      expect(positions).toEqual([...positions].sort((a, b) => a - b));
      expect(positions).not.toContain(-1);
      expect(html).toContain('<img src="https://media.example.com/team.png" alt="The team"');
    });

    it('renders only the body, not the title or the cover image', async () => {
      findFirst.mockResolvedValue(
        storedPost({
          status: 'published',
          publishedAt,
          title: 'A very particular title',
          blocks: [{ id: 'block-1', kind: 'divider' }],
        }) as never,
      );

      const post = await service.getPublishedPost('organization-a', 'spring-openings');

      expect(post?.html).toBe('<hr class="pb-divider" />');
    });

    it('gives a post with no blocks an empty html', async () => {
      findFirst.mockResolvedValue(
        storedPost({ status: 'published', publishedAt, blocks: [] }) as never,
      );

      const post = await service.getPublishedPost('organization-a', 'spring-openings');

      expect(post).toMatchObject({ blocks: [], html: '' });
    });

    it('returns null for a draft slug', async () => {
      findFirst.mockResolvedValue(null);

      await expect(
        service.getPublishedPost('organization-a', 'spring-openings'),
      ).resolves.toBeNull();
      expect(findFirst).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'organization-a',
            slug: 'spring-openings',
            status: 'published',
          },
        }),
      );
    });

    it('lists published posts in one category and with one tag', async () => {
      prisma.post.count.mockResolvedValue(1);
      findMany.mockResolvedValue([
        storedPost({
          status: 'published',
          publishedAt,
          category: NEWS,
          tags: [{ tag: LAUNCH }],
        }),
      ] as never);

      const page = await service.getPublishedPosts('organization-a', {
        page: 1,
        limit: 10,
        category: 'news',
        tag: 'launch',
      });

      const where = {
        organizationId: 'organization-a',
        status: 'published',
        category: { is: { slug: 'news' } },
        tags: { some: { tag: { slug: 'launch' } } },
      };
      expect(prisma.post.count).toHaveBeenCalledWith({ where });
      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where, orderBy: { publishedAt: 'desc' } }),
      );
      expect(page.data).toEqual([
        {
          title: 'Spring openings',
          slug: 'spring-openings',
          excerpt: '',
          publishedAt: publishedAt.toISOString(),
          coverImage: null,
          category: { name: 'News', slug: 'news' },
          tags: [{ name: 'Launch', slug: 'launch' }],
        },
      ]);
    });

    it('lists the posts of the organization by status, category, tag and title', async () => {
      prisma.post.count.mockResolvedValue(0);

      await service.getAllPosts('organization-a', {
        page: 2,
        limit: 20,
        status: 'draft',
        category: 'news',
        tag: 'launch',
        search: 'spring',
      });

      expect(findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            organizationId: 'organization-a',
            status: 'draft',
            category: { is: { slug: 'news' } },
            tags: { some: { tag: { slug: 'launch' } } },
            title: { contains: 'spring', mode: 'insensitive' },
          },
          orderBy: { updatedAt: 'desc' },
          skip: 20,
          take: 20,
        }),
      );
    });
  });
});
