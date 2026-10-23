import {
  DeleteObjectsCommand,
  GetObjectCommand,
  HeadObjectCommand,
  NotFound,
  S3Client,
} from '@aws-sdk/client-s3';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Env } from '../config/env.schema.js';

export interface UploadTarget {
  url: string;
  fields: Record<string, string>;
}

export interface StoredObject {
  sizeBytes: number;
  contentType: string | undefined;
}

@Injectable()
export class StorageService implements OnModuleDestroy {
  readonly bucket: string;
  private readonly internal: S3Client;
  private readonly signer: S3Client;

  constructor(config: ConfigService<Env, true>) {
    this.bucket = config.get('S3_BUCKET', { infer: true });
    const client = (endpoint: string) =>
      new S3Client({
        endpoint,
        region: config.get('S3_REGION', { infer: true }),
        forcePathStyle: true,
        credentials: {
          accessKeyId: config.get('S3_ACCESS_KEY', { infer: true }),
          secretAccessKey: config.get('S3_SECRET_KEY', { infer: true }),
        },
      });
    this.internal = client(config.get('S3_ENDPOINT', { infer: true }));
    this.signer = client(config.get('S3_PUBLIC_ENDPOINT', { infer: true }));
  }

  presignUpload(
    key: string,
    contentType: string,
    sizeBytes: number,
    expiresSeconds: number,
  ): Promise<UploadTarget> {
    return createPresignedPost(this.signer, {
      Bucket: this.bucket,
      Key: key,
      Fields: { 'Content-Type': contentType },
      Conditions: [
        ['content-length-range', sizeBytes, sizeBytes],
        ['eq', '$Content-Type', contentType],
      ],
      Expires: expiresSeconds,
    });
  }

  presignDownload(key: string, expiresSeconds: number): Promise<string> {
    return getSignedUrl(
      this.signer,
      new GetObjectCommand({
        Bucket: this.bucket,
        Key: key,
        ResponseContentDisposition: 'inline',
      }),
      { expiresIn: expiresSeconds },
    );
  }

  async head(key: string): Promise<StoredObject | null> {
    try {
      const object = await this.internal.send(
        new HeadObjectCommand({ Bucket: this.bucket, Key: key }),
      );
      return { sizeBytes: object.ContentLength ?? 0, contentType: object.ContentType };
    } catch (error) {
      if (error instanceof NotFound) {
        return null;
      }
      throw error;
    }
  }

  async delete(keys: readonly string[]) {
    if (keys.length === 0) {
      return;
    }
    await this.internal.send(
      new DeleteObjectsCommand({
        Bucket: this.bucket,
        Delete: { Objects: keys.map((Key) => ({ Key })), Quiet: true },
      }),
    );
  }

  onModuleDestroy() {
    this.internal.destroy();
    this.signer.destroy();
  }
}
