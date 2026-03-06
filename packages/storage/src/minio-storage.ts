import * as Minio from 'minio';
import type { StorageAdapter } from '@reelstack/types';
import { StorageError } from '@reelstack/types';

export class MinioStorageAdapter implements StorageAdapter {
  private client: Minio.Client;
  private bucket: string;

  constructor() {
    const accessKey = process.env.MINIO_ACCESS_KEY;
    const secretKey = process.env.MINIO_SECRET_KEY;
    if (!accessKey || !secretKey) {
      throw new Error('MINIO_ACCESS_KEY and MINIO_SECRET_KEY environment variables are required');
    }
    this.client = new Minio.Client({
      endPoint: process.env.MINIO_ENDPOINT || 'localhost',
      port: parseInt(process.env.MINIO_PORT || '9000', 10) || 9000,
      useSSL: process.env.MINIO_USE_SSL === 'true',
      accessKey,
      secretKey,
    });
    this.bucket = process.env.MINIO_BUCKET || 'reelstack';
  }

  private validatePath(path: string): void {
    if (path.includes('..') || path.startsWith('/')) {
      throw new StorageError('Invalid storage path: must be relative and cannot contain ".."', { path });
    }
  }

  private async ensureBucket(): Promise<void> {
    const exists = await this.client.bucketExists(this.bucket);
    if (!exists) {
      await this.client.makeBucket(this.bucket);
    }
  }

  async upload(file: Buffer, path: string): Promise<string> {
    this.validatePath(path);
    await this.ensureBucket();
    await this.client.putObject(this.bucket, path, file);
    return path;
  }

  async download(path: string): Promise<Buffer> {
    this.validatePath(path);
    const stream = await this.client.getObject(this.bucket, path);
    const chunks: Buffer[] = [];
    for await (const chunk of stream) {
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks);
  }

  async getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
    this.validatePath(path);
    return this.client.presignedGetObject(this.bucket, path, expiresIn);
  }

  async delete(path: string): Promise<void> {
    this.validatePath(path);
    await this.client.removeObject(this.bucket, path);
  }
}
