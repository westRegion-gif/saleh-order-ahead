import { PrismaClient } from '@prisma/client';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { randomUUID } from 'crypto';

const prisma = new PrismaClient();

async function main() {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || 'auto';
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const mediaBase = process.env.MEDIA_PUBLIC_BASE_URL?.replace(/\/$/, '') ||
    (process.env.API_PUBLIC_URL ? `${process.env.API_PUBLIC_URL.replace(/\/$/, '')}/v1/media` : '');

  if (!endpoint || !bucket || !accessKeyId || !secretAccessKey || !mediaBase) {
    throw new Error('S3 credentials and MEDIA_PUBLIC_BASE_URL or API_PUBLIC_URL are required before media migration');
  }

  const client = new S3Client({
    region,
    endpoint,
    forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
    credentials: { accessKeyId, secretAccessKey },
  });

  const products = await prisma.product.findMany({
    where: { imageUrl: { startsWith: 'https://raw.githubusercontent.com/' } },
    select: { id: true, sku: true, imageUrl: true },
  });

  let migrated = 0;
  for (const product of products) {
    if (!product.imageUrl) continue;
    const response = await fetch(product.imageUrl);
    if (!response.ok) throw new Error(`Failed to fetch image for ${product.sku}: ${response.status}`);

    const contentType = response.headers.get('content-type') || 'image/png';
    const ext = contentType.includes('jpeg') ? 'jpg' : contentType.includes('webp') ? 'webp' : 'png';
    const key = `products/${product.sku.toLowerCase()}-${randomUUID()}.${ext}`;
    const bytes = Buffer.from(await response.arrayBuffer());

    await client.send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: bytes, ContentType: contentType }));

    const imageUrl = `${mediaBase}/object/${encodeURIComponent(key)}`;
    await prisma.product.update({ where: { id: product.id }, data: { imageUrl } });
    migrated++;
    console.log(`Migrated ${product.sku}`);
  }

  console.log(`Media migration complete. ${migrated} product image(s) migrated.`);
}

main()
  .catch((error) => { console.error(error); process.exitCode = 1; })
  .finally(async () => prisma.$disconnect());
