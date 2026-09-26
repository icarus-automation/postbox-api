import { randomUUID } from 'node:crypto';

import { BadRequestException, Inject, Injectable } from '@nestjs/common';

import {
  isUniqueConstraintViolation,
  type UniqueConstraint,
} from '../../core/database/prisma-errors';
import { PrismaService } from '../../core/database/prisma.service';
import {
  DraftRejected,
  IMAGE_CONTENT_TYPES,
  MAX_IMAGE_BYTES,
  type HttpUrl,
  type ImageContentType,
  type MediaId,
  type MediaRef,
} from './document/content.types';
import { OBJECT_STORAGE, type ObjectStorage } from './object-storage';
import type { MediaIndex } from './document/block-registry';

const MEDIA_STORAGE_KEY_CONSTRAINT: UniqueConstraint = {
  index: 'media_storage_key_key',
  fields: ['storage_key'],
};

type MediaRow = {
  id: string;
  organizationId: string;
  storageKey: string;
  contentType: string;
  byteSize: number;
  alt: string;
};

@Injectable()
export class ContentMediaService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
  ) {}

  async presign(
    organizationId: string,
    input: { contentType: ImageContentType; byteSize: number },
  ): Promise<{
    uploadUrl: string;
    storageKey: string;
    headers: Record<string, string>;
  }> {
    if (
      !(IMAGE_CONTENT_TYPES as readonly string[]).includes(input.contentType) ||
      !Number.isInteger(input.byteSize) ||
      input.byteSize < 1 ||
      input.byteSize > MAX_IMAGE_BYTES
    ) {
      throw new BadRequestException('Image upload is invalid');
    }
    const storageKey = `orgs/${organizationId}/media/${randomUUID()}`;
    const signed = await this.storage.presignPut({
      storageKey,
      contentType: input.contentType,
      byteSize: input.byteSize,
    });
    return { storageKey, ...signed };
  }

  async confirm(
    organizationId: string,
    input: { storageKey: string; alt: string },
  ): Promise<MediaRef | null> {
    const alt = input.alt?.trim() ?? '';
    if (alt.length < 1 || alt.length > 500) {
      throw new BadRequestException('Alt text is required');
    }
    const prefix = `orgs/${organizationId}/media/`;
    if (!input.storageKey.startsWith(prefix) || input.storageKey.includes('..')) {
      return null;
    }

    const existing = await this.findByKey(input.storageKey);
    if (existing) {
      return existing.organizationId === organizationId ? this.toRef(existing) : null;
    }

    const object = await this.storage.head(input.storageKey);
    if (
      !object ||
      !(IMAGE_CONTENT_TYPES as readonly string[]).includes(object.contentType) ||
      object.byteSize < 1 ||
      object.byteSize > MAX_IMAGE_BYTES
    ) {
      throw new BadRequestException('Upload was not found');
    }

    try {
      const created = await this.prisma.media.create({
        data: {
          organizationId,
          storageKey: input.storageKey,
          contentType: object.contentType,
          byteSize: object.byteSize,
          alt,
        },
      });
      return this.toRef(created);
    } catch (error) {
      if (!isUniqueConstraintViolation(error, MEDIA_STORAGE_KEY_CONSTRAINT)) throw error;
      const winner = await this.findByKey(input.storageKey);
      if (!winner || winner.organizationId !== organizationId) return null;
      return this.toRef(winner);
    }
  }

  async indexFor(organizationId: string, ids: readonly string[]): Promise<MediaIndex> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return new Map();
    const rows = await this.prisma.media.findMany({
      where: { organizationId, id: { in: unique } },
    });
    if (rows.length !== unique.length) {
      throw new DraftRejected('Image was not found');
    }
    return new Map(rows.map((row) => [row.id as MediaId, this.toRef(row)]));
  }

  toRef(row: MediaRow): MediaRef {
    if (!(IMAGE_CONTENT_TYPES as readonly string[]).includes(row.contentType)) {
      throw new Error('Stored media content type is invalid');
    }
    return {
      id: row.id as MediaId,
      url: this.storage.publicUrl(row.storageKey) as HttpUrl,
      alt: row.alt,
      contentType: row.contentType as ImageContentType,
    };
  }

  private findByKey(storageKey: string): Promise<MediaRow | null> {
    return this.prisma.media.findUnique({ where: { storageKey } });
  }
}
