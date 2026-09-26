import { ConflictException } from '@nestjs/common';
import { mock, mockReset } from 'jest-mock-extended';

import type { OrganizationSession } from '../auth/types/auth.types';
import { ContentAccessController } from './content-access.controller';
import { ContentEntriesController } from './content-entries.controller';
import { ContentEntriesService } from './content-entries.service';
import type { EditorEntryJson } from './document/content.types';

describe('ContentEntriesController', () => {
  const content = mock<ContentEntriesService>();
  const controller = new ContentEntriesController(content);
  const session = {
    session: { activeOrganizationId: 'organization-a' },
  } as OrganizationSession;

  beforeEach(() => {
    mockReset(content);
  });

  it('rejects a draft patch of a published document', async () => {
    content.updateDraft.mockResolvedValue('published');

    await expect(
      controller.updateDraft('entry-1', { title: 'Nope' }, 'organization-a'),
    ).rejects.toBeInstanceOf(ConflictException);
    expect(content.updateDraft).toHaveBeenCalledWith(
      'organization-a',
      'entry-1',
      { title: 'Nope' },
    );
  });

  it('publishes and unpublishes with the session organization', async () => {
    const entry = { id: 'entry-1' } as EditorEntryJson;
    content.publish.mockResolvedValue(entry);
    content.unpublish.mockResolvedValue(entry);
    content.saveFromEditor.mockResolvedValue(entry);

    await expect(controller.publishContent('entry-1', session)).resolves.toBe(entry);
    await expect(controller.unpublishContent('entry-1', session)).resolves.toBe(entry);
    await expect(
      controller.saveContent(
        'entry-1',
        { title: 'Spring', slug: 'spring', blocks: [] },
        session,
      ),
    ).resolves.toBe(entry);

    expect(content.publish).toHaveBeenCalledWith(
      'organization-a',
      'entry-1',
      expect.any(Date),
    );
    expect(content.unpublish).toHaveBeenCalledWith('organization-a', 'entry-1');
    expect(content.saveFromEditor).toHaveBeenCalledWith(
      'organization-a',
      'entry-1',
      expect.any(Object),
    );
  });

  it('does not mount an API key on publish, unpublish, save, or content access', () => {
    expect(
      Reflect.getMetadata('OPTIONAL', ContentEntriesController.prototype.publishContent),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('OPTIONAL', ContentEntriesController.prototype.unpublishContent),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('OPTIONAL', ContentEntriesController.prototype.saveContent),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('OPTIONAL', ContentAccessController.prototype.rotatePublicKey),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('OPTIONAL', ContentAccessController.prototype.getContentAccess),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('OPTIONAL', ContentAccessController.prototype.setWebhook),
    ).toBeUndefined();
    expect(
      Reflect.getMetadata('OPTIONAL', ContentEntriesController.prototype.createContent),
    ).toBe(true);
  });
});
