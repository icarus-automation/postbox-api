import { NotFoundException } from '@nestjs/common';
import { mock, mockReset } from 'jest-mock-extended';

import type { OrganizationSession } from '../auth/types/auth.types';
import { CategoriesController } from './categories.controller';
import { CategoriesService } from './categories.service';
import { TagsController } from './tags.controller';

const orgRoles = (target: object) => Reflect.getMetadata('ORG_ROLES', target) as unknown;
const optional = (target: object) => Reflect.getMetadata('OPTIONAL', target) as unknown;

describe('CategoriesController', () => {
  const categories = mock<CategoriesService>();
  const controller = new CategoriesController(categories);
  const session = {
    session: { activeOrganizationId: 'organization-a' },
  } as OrganizationSession;

  beforeEach(() => {
    mockReset(categories);
  });

  it('answers 404 when the category to rename or delete is not there', async () => {
    categories.renameCategory.mockResolvedValue(null);
    categories.deleteCategory.mockResolvedValue(null);

    await expect(
      controller.renameCategory('category-9', { name: 'News' }, session),
    ).rejects.toBeInstanceOf(NotFoundException);
    await expect(controller.deleteCategory('category-9', session)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(categories.deleteCategory).toHaveBeenCalledWith('organization-a', 'category-9');
  });

  it('leaves renaming and deleting to owners and admins, for categories and tags alike', () => {
    for (const controllerClass of [CategoriesController, TagsController]) {
      expect(orgRoles(controllerClass)).toEqual(['owner', 'admin']);
    }
    expect(orgRoles(CategoriesController.prototype.renameCategory)).toBeUndefined();
    expect(orgRoles(CategoriesController.prototype.deleteCategory)).toBeUndefined();
    expect(orgRoles(TagsController.prototype.renameTag)).toBeUndefined();
    expect(orgRoles(TagsController.prototype.deleteTag)).toBeUndefined();
  });

  it('lets any member add one from the editor, and never an API key', () => {
    for (const handler of [
      CategoriesController.prototype.createCategory,
      TagsController.prototype.createTag,
    ]) {
      expect(orgRoles(handler)).toEqual(['owner', 'admin', 'member']);
      expect(optional(handler)).toBeUndefined();
    }
  });

  it('opens the lists to members and API keys', () => {
    for (const handler of [
      CategoriesController.prototype.getAllCategories,
      TagsController.prototype.getAllTags,
    ]) {
      expect(orgRoles(handler)).toEqual(['owner', 'admin', 'member']);
      expect(optional(handler)).toBe(true);
    }
  });
});
