import { BadRequestException, ConflictException } from '@nestjs/common';
import { mock, mockDeep, mockReset } from 'jest-mock-extended';

import type { PrismaService } from '../../core/database/prisma.service';
import { CategoriesService } from './categories.service';
import { PostsService } from './posts.service';
import { TagsService } from './tags.service';

function storedCategory(overrides: Record<string, unknown> = {}) {
  return {
    id: 'category-1',
    name: 'News',
    slug: 'news',
    _count: { posts: 3 },
    ...overrides,
  };
}

describe('CategoriesService', () => {
  const prisma = mockDeep<PrismaService>();
  const posts = mock<PostsService>();
  const service = new CategoriesService(prisma, posts);

  const { findFirst, findMany, create, update } = prisma.category;

  beforeEach(() => {
    mockReset(prisma);
    mockReset(posts);
    findMany.mockResolvedValue([]);
    prisma.post.findMany.mockResolvedValue([]);
    create.mockImplementation(((args: { data: { name: string; slug: string } }) =>
      Promise.resolve(
        storedCategory({ id: 'category-2', ...args.data, _count: { posts: 0 } }),
      )) as never);
    update.mockImplementation(((args: { data: { name: string; slug: string } }) =>
      Promise.resolve(storedCategory(args.data))) as never);
  });

  it('adds a category with a slug made from its name', async () => {
    findFirst.mockResolvedValue(null);

    const category = await service.createCategory('organization-a', {
      name: '  Product   launches ',
    });

    expect(category).toEqual({
      id: 'category-2',
      name: 'Product launches',
      slug: 'product-launches',
      postCount: 0,
    });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: {
          organizationId: 'organization-a',
          name: 'Product launches',
          slug: 'product-launches',
        },
      }),
    );
  });

  it('picks the category that already has the name, in any case', async () => {
    findFirst.mockResolvedValue(storedCategory() as never);

    const category = await service.createCategory('organization-a', { name: 'news' });

    expect(category).toEqual({ id: 'category-1', name: 'News', slug: 'news', postCount: 3 });
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          name: { equals: 'news', mode: 'insensitive' },
        },
      }),
    );
    expect(create).not.toHaveBeenCalled();
  });

  it('numbers the slug of a different name that makes the same one', async () => {
    findFirst.mockResolvedValue(null);
    findMany.mockResolvedValue([{ slug: 'c' }] as never);

    const category = await service.createCategory('organization-a', { name: 'C#' });

    expect(category.slug).toBe('c-2');
  });

  it('refuses a name with nothing to make a slug from', async () => {
    findFirst.mockResolvedValue(null);

    await expect(
      service.createCategory('organization-a', { name: '???' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(create).not.toHaveBeenCalled();
  });

  it('renames and keeps the slug, and tells the site about its published posts', async () => {
    findFirst
      .mockResolvedValueOnce(storedCategory({ name: 'Billing', slug: 'billing' }) as never)
      .mockResolvedValueOnce(null);
    prisma.post.findMany.mockResolvedValue([{ id: 'post-1' }] as never);

    const category = await service.renameCategory('organization-a', 'category-1', {
      name: 'Billing & Payments',
    });

    expect(category).toMatchObject({ name: 'Billing & Payments', slug: 'billing' });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { name: 'Billing & Payments', slug: 'billing' },
      }),
    );
    expect(prisma.post.findMany).toHaveBeenCalledWith({
      where: { organizationId: 'organization-a', categoryId: 'category-1', status: 'published' },
      select: { id: true },
    });
    expect(posts.announceUpdatedPosts).toHaveBeenCalledWith('organization-a', ['post-1']);
  });

  it('changes the slug when the edit sets one, and tells the site', async () => {
    findFirst
      .mockResolvedValueOnce(storedCategory({ name: 'Billing', slug: 'billing' }) as never)
      .mockResolvedValueOnce(null);
    prisma.post.findMany.mockResolvedValue([{ id: 'post-1' }] as never);

    const category = await service.renameCategory('organization-a', 'category-1', {
      name: 'Billing',
      slug: 'utility-billing',
    });

    expect(category).toMatchObject({ name: 'Billing', slug: 'utility-billing' });
    expect(posts.announceUpdatedPosts).toHaveBeenCalledWith('organization-a', ['post-1']);
  });

  it('refuses a slug another category already uses', async () => {
    findFirst
      .mockResolvedValueOnce(storedCategory({ name: 'Billing', slug: 'billing' }) as never)
      .mockResolvedValueOnce({ id: 'category-2' } as never);

    await expect(
      service.renameCategory('organization-a', 'category-1', {
        name: 'Billing',
        slug: 'payments',
      }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
    expect(posts.announceUpdatedPosts).not.toHaveBeenCalled();
  });

  it('refuses a slug that is not lowercase kebab-case', async () => {
    findFirst.mockResolvedValueOnce(storedCategory() as never);

    await expect(
      service.renameCategory('organization-a', 'category-1', {
        name: 'News',
        slug: 'Big News',
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(update).not.toHaveBeenCalled();
  });

  it('leaves a category alone when the name and slug are unchanged', async () => {
    findFirst.mockResolvedValueOnce(storedCategory() as never);

    const category = await service.renameCategory('organization-a', 'category-1', {
      name: 'News',
      slug: 'news',
    });

    expect(category).toMatchObject({ name: 'News', slug: 'news' });
    expect(update).not.toHaveBeenCalled();
    expect(posts.announceUpdatedPosts).not.toHaveBeenCalled();
  });

  it('stores an explicit slug on create', async () => {
    findFirst.mockResolvedValue(null);

    const category = await service.createCategory('organization-a', {
      name: 'Billing',
      slug: 'utility-billing',
    });

    expect(category.slug).toBe('utility-billing');
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ name: 'Billing', slug: 'utility-billing' }) as unknown,
      }),
    );
  });

  it('refuses a create slug another category already uses', async () => {
    findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: 'category-9' } as never);

    await expect(
      service.createCategory('organization-a', { name: 'Billing', slug: 'billing' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(create).not.toHaveBeenCalled();
  });

  it('refuses a rename to a name another category has', async () => {
    findFirst
      .mockResolvedValueOnce(storedCategory() as never)
      .mockResolvedValueOnce({ id: 'category-2' } as never);

    await expect(
      service.renameCategory('organization-a', 'category-1', { name: 'Events' }),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(update).not.toHaveBeenCalled();
  });

  it('deletes the category and leaves its posts to the database to clear', async () => {
    findFirst.mockResolvedValue(storedCategory() as never);
    prisma.post.findMany.mockResolvedValue([{ id: 'post-1' }, { id: 'post-2' }] as never);

    const deleted = await service.deleteCategory('organization-a', 'category-1');

    expect(deleted).toEqual({ id: 'category-1', name: 'News', slug: 'news', postCount: 3 });
    expect(prisma.category.delete).toHaveBeenCalledWith({ where: { id: 'category-1' } });
    expect(prisma.post.update).not.toHaveBeenCalled();
    expect(prisma.post.delete).not.toHaveBeenCalled();
    expect(posts.announceUpdatedPosts).toHaveBeenCalledWith('organization-a', [
      'post-1',
      'post-2',
    ]);
  });

  it('lists only categories with a published post on the site', async () => {
    findMany.mockResolvedValue([{ name: 'News', slug: 'news', _count: { posts: 2 } }] as never);

    await expect(service.getPublishedCategories('organization-a')).resolves.toEqual([
      { name: 'News', slug: 'news', postCount: 2 },
    ]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { organizationId: 'organization-a', posts: { some: { status: 'published' } } },
      }),
    );
  });
});

describe('TagsService', () => {
  const prisma = mockDeep<PrismaService>();
  const posts = mock<PostsService>();
  const service = new TagsService(prisma, posts);

  beforeEach(() => {
    mockReset(prisma);
    mockReset(posts);
  });

  it('deletes a tag and tells the site about the published posts that had it', async () => {
    prisma.tag.findFirst.mockResolvedValue(storedCategory({ id: 'tag-1' }) as never);
    prisma.post.findMany.mockResolvedValue([{ id: 'post-1' }] as never);

    await service.deleteTag('organization-a', 'tag-1');

    expect(prisma.post.findMany).toHaveBeenCalledWith({
      where: {
        organizationId: 'organization-a',
        status: 'published',
        tags: { some: { tagId: 'tag-1' } },
      },
      select: { id: true },
    });
    expect(prisma.tag.delete).toHaveBeenCalledWith({ where: { id: 'tag-1' } });
    expect(posts.announceUpdatedPosts).toHaveBeenCalledWith('organization-a', ['post-1']);
  });

  it('lists only tags on a published post, counting published posts', async () => {
    prisma.tag.findMany.mockResolvedValue([] as never);

    await service.getPublishedTags('organization-a');

    expect(prisma.tag.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          organizationId: 'organization-a',
          posts: { some: { post: { status: 'published' } } },
        },
        select: {
          name: true,
          slug: true,
          _count: { select: { posts: { where: { post: { status: 'published' } } } } },
        },
      }),
    );
  });
});
