import { ConflictException, NotFoundException } from '@nestjs/common';
import { mock, mockReset } from 'jest-mock-extended';

import type { OrganizationSession } from '../auth/types/auth.types';
import { BlogAccessController } from './blog-access.controller';
import type { EditorPostJson } from './document/blog.types';
import { PostsController } from './posts.controller';
import { PostsService } from './posts.service';

describe('PostsController', () => {
  const posts = mock<PostsService>();
  const controller = new PostsController(posts);
  const session = {
    session: { activeOrganizationId: 'organization-a' },
  } as OrganizationSession;

  beforeEach(() => {
    mockReset(posts);
  });

  it('rejects a draft patch of a published post', async () => {
    posts.updateDraft.mockResolvedValue('published');

    await expect(
      controller.updateDraft('post-1', { title: 'Nope' }, 'organization-a'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(posts.updateDraft).toHaveBeenCalledWith('organization-a', 'post-1', {
      title: 'Nope',
    });
  });

  it('answers 404 for a post outside the organization', async () => {
    posts.getPost.mockResolvedValue(null);

    await expect(controller.getPost('post-9', 'organization-a')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('publishes, unpublishes and saves with the session organization', async () => {
    const post = { id: 'post-1' } as EditorPostJson;
    posts.publishPost.mockResolvedValue(post);
    posts.unpublishPost.mockResolvedValue(post);
    posts.savePost.mockResolvedValue(post);

    await expect(controller.publishPost('post-1', session)).resolves.toBe(post);
    await expect(controller.unpublishPost('post-1', session)).resolves.toBe(post);
    await expect(
      controller.savePost('post-1', { title: 'Spring', slug: null, blocks: [] }, session),
    ).resolves.toBe(post);

    expect(posts.publishPost).toHaveBeenCalledWith(
      'organization-a',
      'post-1',
      expect.any(Date),
    );
    expect(posts.unpublishPost).toHaveBeenCalledWith('organization-a', 'post-1');
    expect(posts.savePost).toHaveBeenCalledWith(
      'organization-a',
      'post-1',
      expect.any(Object),
    );
  });

  it('lets an API key draft but never publish, unpublish, save, or manage access', () => {
    const optional = (handler: object) => Reflect.getMetadata('OPTIONAL', handler) as unknown;

    expect(optional(PostsController.prototype.publishPost)).toBeUndefined();
    expect(optional(PostsController.prototype.unpublishPost)).toBeUndefined();
    expect(optional(PostsController.prototype.savePost)).toBeUndefined();
    expect(optional(BlogAccessController.prototype.getBlogAccess)).toBeUndefined();
    expect(optional(BlogAccessController.prototype.setWebhook)).toBeUndefined();
    expect(optional(PostsController.prototype.createPost)).toBe(true);
    expect(optional(PostsController.prototype.updateDraft)).toBe(true);
  });
});
