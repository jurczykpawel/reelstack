import { createClient } from '@supabase/supabase-js';
import type { StorageAdapter } from '@reelstack/types';

export class SupabaseStorageAdapter implements StorageAdapter {
  private supabase;
  private bucket: string;

  constructor() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) {
      throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    }
    this.supabase = createClient(url, key);
    this.bucket = process.env.SUPABASE_STORAGE_BUCKET || 'videos';
  }

  async upload(file: Buffer, path: string): Promise<string> {
    const { error } = await this.supabase.storage.from(this.bucket).upload(path, file, {
      upsert: true,
    });
    if (error) throw new Error(`Storage upload failed: ${error.message}`);
    return path;
  }

  async download(path: string): Promise<Buffer> {
    const { data, error } = await this.supabase.storage.from(this.bucket).download(path);
    if (error || !data) throw new Error(`Storage download failed: ${error?.message}`);
    const arrayBuffer = await data.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async getSignedUrl(path: string, expiresIn = 3600): Promise<string> {
    const { data, error } = await this.supabase.storage
      .from(this.bucket)
      .createSignedUrl(path, expiresIn);
    if (error || !data) throw new Error(`Signed URL failed: ${error?.message}`);
    return data.signedUrl;
  }

  async delete(path: string): Promise<void> {
    const { error } = await this.supabase.storage.from(this.bucket).remove([path]);
    if (error) throw new Error(`Storage delete failed: ${error.message}`);
  }
}
