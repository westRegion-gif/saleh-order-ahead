import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'crypto';

@Injectable()
export class MediaService {
  async presign(filename:string, contentType:string){
    const endpoint=process.env.S3_ENDPOINT, region=process.env.S3_REGION||'auto', bucket=process.env.S3_BUCKET;
    const accessKeyId=process.env.S3_ACCESS_KEY_ID, secretAccessKey=process.env.S3_SECRET_ACCESS_KEY, publicBase=process.env.S3_PUBLIC_BASE_URL;
    if(!endpoint||!bucket||!accessKeyId||!secretAccessKey||!publicBase) throw new ServiceUnavailableException('Media storage is not configured');
    const ext=(filename.split('.').pop()||'jpg').replace(/[^a-zA-Z0-9]/g,'').toLowerCase();
    const key=`products/${Date.now()}-${randomUUID()}.${ext}`;
    const client=new S3Client({region,endpoint,forcePathStyle:true,credentials:{accessKeyId,secretAccessKey}});
    const uploadUrl=await getSignedUrl(client,new PutObjectCommand({Bucket:bucket,Key:key,ContentType:contentType}),{expiresIn:300});
    return {uploadUrl,publicUrl:`${publicBase.replace(/\/$/,'')}/${key}`,key};
  }
}
