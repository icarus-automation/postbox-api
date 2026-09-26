import { mock, mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import { ContentEntriesService } from './content-entries.service';
import { ContentMediaService } from './content-media.service';
import { ContentWebhook } from './content-webhook.service';
import type { CreateContentDTO } from './dto/create-content.dto';
import type { SaveContentDTO } from './dto/save-content.dto';

const updatedAt = new Date('2026-09-24T08:00:00.000Z');
const publishedAt = new Date('2026-09-24T09:00:00.000Z');

function storedEntry(overrides: Record<string, unknown> = {}) {
  return {
    id: 'entry-1',
    organizationId: 'organization-a',
    kind: 'post',
    title: 'Spring openings',
    slug: 'spring-openings',
    excerpt: '',
    metaTitle: '',
    metaDescription: '',
    ogImageId: null,
    coverImageId: null,
    ogImage: null,
    coverImage: null,
    status: 'draft',
    publishedAt: null,
    blocks: [],
    createdAt: updatedAt,
    updatedAt,
    ...overrides,
  };
}

describe('ContentEntriesService', () => {
  const prisma = mockDeep<PrismaService>();
  const media = mock<ContentMediaService>();
  const webhooks = mock<ContentWebhook>();
  const service = new ContentEntriesService(prisma, media, webhooks);

  const { create, update, findFirst } = prisma.contentEntry;

  beforeEach(() => {
    mockReset(prisma);
    mockReset(media);
    mockReset(webhooks);
    media.indexFor.mockResolvedValue(new Map());
    prisma.organization.findUnique.mockResolvedValue({
      id: 'organization-a',
      slug: 'acme',
    } as never);
    prisma.contentAccess.findUnique.mockResolvedValue({
      webhookUrl: 'https://hooks.example/cms',
      webhookSecret: 'sekret',
    } as never);
    webhooks.deliver.mockResolvedValue(undefined);
  });

  function echoWrite(data: Record<string, unknown>, status: Record<string, unknown> = {}) {
    return storedEntry({
      title: data.title,
      slug: data.slug,
      excerpt: data.excerpt,
      metaTitle: data.metaTitle,
      metaDescription: data.metaDescription,
      blocks: data.blocks,
      ...status,
    });
  }

  it('creates a draft and fills an empty post from the template', async () => {
    create.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve(echoWrite(args.data))) as never);

    const body: CreateContentDTO = {
      kind: 'post',
      title: 'Spring openings',
      slug: 'spring-openings',
    };
    const entry = await service.createDraft('organization-a', body);

    expect(entry.status).toBe('draft');
    expect(entry.publishedAt).toBeNull();
    expect(entry.blocks).toHaveLength(1);
    expect(entry.blocks[0]).toMatchObject({
      kind: 'rich_text',
      html: '<p></p>',
    });
    expect(create.mock.calls[0]?.[0].data).toMatchObject({
      organizationId: 'organization-a',
      kind: 'post',
      status: 'draft',
      publishedAt: null,
    });
  });

  it('updates a draft without changing publication', async () => {
    findFirst.mockResolvedValue(storedEntry() as never);
    update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve(echoWrite(args.data))) as never);

    const entry = await service.updateDraft('organization-a', 'entry-1', {
      title: 'Summer openings',
    });

    expect(entry).toMatchObject({
      title: 'Summer openings',
      status: 'draft',
      publishedAt: null,
    });
    expect(webhooks.deliver).not.toHaveBeenCalled();
  });

  it('publishes a draft once and ignores a second publish', async () => {
    findFirst.mockResolvedValueOnce(storedEntry() as never);
    update.mockResolvedValue(
      storedEntry({ status: 'published', publishedAt }) as never,
    );

    const published = await service.publish(
      'organization-a',
      'entry-1',
      publishedAt,
    );
    await new Promise((resolve) => setImmediate(resolve));

    expect(published).toMatchObject({
      status: 'published',
      publishedAt: publishedAt.toISOString(),
    });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'published', publishedAt },
      }),
    );
    expect(webhooks.deliver).toHaveBeenCalledWith(
      expect.objectContaining({
        type: 'content.published',
        organizationSlug: 'acme',
      }),
      { url: 'https://hooks.example/cms', secret: 'sekret' },
    );

    findFirst.mockResolvedValueOnce(
      storedEntry({ status: 'published', publishedAt }) as never,
    );
    webhooks.deliver.mockClear();
    await service.publish('organization-a', 'entry-1', new Date());
    await new Promise((resolve) => setImmediate(resolve));
    expect(webhooks.deliver).not.toHaveBeenCalled();
  });

  it('does not reject publish when the webhook throws', async () => {
    findFirst.mockResolvedValue(storedEntry() as never);
    update.mockResolvedValue(
      storedEntry({ status: 'published', publishedAt }) as never,
    );
    webhooks.deliver.mockRejectedValue(new Error('down'));

    await expect(
      service.publish('organization-a', 'entry-1', publishedAt),
    ).resolves.toMatchObject({ status: 'published' });
    await new Promise((resolve) => setImmediate(resolve));
    expect(webhooks.deliver).toHaveBeenCalled();
  });

  it('unpublishes and still sends the slug and blocks', async () => {
    findFirst.mockResolvedValue(
      storedEntry({ status: 'published', publishedAt }) as never,
    );
    update.mockResolvedValue(storedEntry({ status: 'draft', publishedAt: null }) as never);

    const entry = await service.unpublish('organization-a', 'entry-1');
    await new Promise((resolve) => setImmediate(resolve));

    expect(entry).toMatchObject({ status: 'draft', publishedAt: null });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { status: 'draft', publishedAt: null },
      }),
    );
    expect(webhooks.deliver.mock.calls[0]?.[0]).toMatchObject({
      type: 'content.unpublished',
      entry: {
        slug: 'spring-openings',
        status: 'draft',
        blocks: [],
      },
    });
  });

  it('saves a published row and tells the webhook the public page changed', async () => {
    findFirst.mockResolvedValue(
      storedEntry({ status: 'published', publishedAt }) as never,
    );
    update.mockImplementation(((args: { data: Record<string, unknown> }) =>
      Promise.resolve(
        echoWrite(args.data, {
          status: 'published',
          publishedAt,
        }),
      )) as never);
    const body: SaveContentDTO = {
      title: 'Spring openings revised',
      slug: 'spring-openings',
      blocks: [{ kind: 'heading', level: 2, text: 'Hello' }],
    };

    const entry = await service.saveFromEditor('organization-a', 'entry-1', body);
    await new Promise((resolve) => setImmediate(resolve));

    expect(entry).toMatchObject({
      status: 'published',
      publishedAt: publishedAt.toISOString(),
      title: 'Spring openings revised',
    });
    expect(webhooks.deliver).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'content.updated', organizationSlug: 'acme' }),
      expect.any(Object),
    );
  });

  it('returns null for a draft slug on the public read', async () => {
    findFirst.mockResolvedValue(storedEntry() as never);

    await expect(
      service.getPublishedBySlug('organization-a', 'spring-openings'),
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
});
