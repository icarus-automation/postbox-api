import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, ServiceUnavailableException } from '@nestjs/common';

import { env } from '../../core/config/env.config';
import type { ObjectStorage, StoredObject } from './object-storage';

const PRESIGN_SECONDS = 300;

type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  publicBaseUrl: string;
};

function r2Config(): R2Config | null {
  const {
    R2_ACCOUNT_ID,
    R2_ACCESS_KEY_ID,
    R2_SECRET_ACCESS_KEY,
    R2_BUCKET,
    R2_PUBLIC_BASE_URL,
  } = env;
  if (
    !R2_ACCOUNT_ID ||
    !R2_ACCESS_KEY_ID ||
    !R2_SECRET_ACCESS_KEY ||
    !R2_BUCKET ||
    !R2_PUBLIC_BASE_URL
  ) {
    return null;
  }
  return {
    accountId: R2_ACCOUNT_ID,
    accessKeyId: R2_ACCESS_KEY_ID,
    secretAccessKey: R2_SECRET_ACCESS_KEY,
    bucket: R2_BUCKET,
    publicBaseUrl: R2_PUBLIC_BASE_URL.replace(/\/$/, ''),
  };
}

function requireR2(): R2Config {
  const config = r2Config();
  if (!config) {
    throw new ServiceUnavailableException('Media storage is not configured');
  }
  return config;
}

@Injectable()
export class R2ObjectStorage implements ObjectStorage {
  private client: S3Client | null = null;

  private s3(): S3Client {
    if (this.client) return this.client;
    const config = requireR2();
    this.client = new S3Client({
      region: 'auto',
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      // The SDK otherwise signs an empty CRC32 into the URL. R2 then rejects the
      // browser PUT, and the extra checksum header fails the bucket preflight.
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    });
    return this.client;
  }

  async presignPut(input: {
    storageKey: string;
    contentType: string;
    byteSize: number;
  }): Promise<{ uploadUrl: string; headers: Record<string, string> }> {
    const config = requireR2();
    const command = new PutObjectCommand({
      Bucket: config.bucket,
      Key: input.storageKey,
      ContentType: input.contentType,
      ContentLength: input.byteSize,
    });
    const uploadUrl = await getSignedUrl(this.s3(), command, {
      expiresIn: PRESIGN_SECONDS,
    });
    return {
      uploadUrl,
      headers: {
        'content-type': input.contentType,
        'content-length': String(input.byteSize),
      },
    };
  }

  async head(storageKey: string): Promise<StoredObject | null> {
    const config = requireR2();
    try {
      const result = await this.s3().send(
        new HeadObjectCommand({ Bucket: config.bucket, Key: storageKey }),
      );
      return {
        contentType: result.ContentType ?? '',
        byteSize: result.ContentLength ?? 0,
      };
    } catch (error) {
      const status = (error as { $metadata?: { httpStatusCode?: number } }).$metadata
        ?.httpStatusCode;
      const name = (error as { name?: string }).name;
      if (status === 404 || name === 'NotFound' || name === 'NoSuchKey') return null;
      throw error;
    }
  }

  publicUrl(storageKey: string): string {
    const config = requireR2();
    return `${config.publicBaseUrl}/${storageKey}`;
  }
}
