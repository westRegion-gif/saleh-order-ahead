import { Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
  private config() {
    const endpoint = process.env.S3_ENDPOINT;
    const region = process.env.S3_REGION || 'auto';
    const bucket = process.env.S3_BUCKET;
    const accessKeyId = process.env.S3_ACCESS_KEY_ID;
    const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
    if (!endpoint || !bucket || !accessKeyId || !secretAccessKey) {
      throw new ServiceUnavailableException('Media storage is not configured');
    }
    const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === 'true';
    const client = new S3Client({ region, endpoint, forcePathStyle, credentials: { accessKeyId, secretAccessKey } });
    return { client, bucket };
  }

  private mediaBase() {
    const explicit = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, '');
    if (explicit) return explicit;
    const api = process.env.API_PUBLIC_URL?.replace(/\/$/, '');
    if (api) return `${api}/v1/media`;
    throw new ServiceUnavailableException('MEDIA_PUBLIC_BASE_URL or API_PUBLIC_URL is required');
  }

  async presign(filename: string, contentType: string) {
    const { client, bucket } = this.config();
    const ext = (filename.split('.').pop() || 'jpg').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
    const key = `products/${Date.now()}-${randomUUID()}.${ext}`;
    const uploadUrl = await getSignedUrl(client, new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }), { expiresIn: 300 });
    const publicUrl = `${this.mediaBase()}/object/${encodeURIComponent(key)}`;
    return { uploadUrl, publicUrl, key };
  }

  async signedReadUrl(key: string) {
    if (!key || !key.startsWith('products/')) throw new NotFoundException('Media object not found');
    const { client, bucket } = this.config();
    return getSignedUrl(client, new GetObjectCommand({ Bucket: bucket, Key: key }), { expiresIn: 900 });
  }
}
