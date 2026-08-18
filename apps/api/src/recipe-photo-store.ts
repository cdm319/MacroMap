import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  maxRecipePhotoBytes,
  type RecipePhotoContentType,
} from '@macromap/contracts';

const signedUrlLifetimeSeconds = 5 * 60;

export interface RecipePhotoStore {
  completeUpload(recipeId: string, uploadId: string): Promise<void>;
  createUpload(
    recipeId: string,
    uploadId: string,
    contentType: RecipePhotoContentType,
  ): Promise<string>;
  delete(recipeId: string): Promise<void>;
  publishImport(recipeId: string, importId: string): Promise<void>;
  stageImport(
    importId: string,
    bytes: Uint8Array,
    contentType: RecipePhotoContentType,
  ): Promise<void>;
  viewUrl(recipeId: string): Promise<string>;
}

export class InvalidRecipePhotoError extends Error {
  public constructor() {
    super('Choose a JPEG, PNG, or WebP image no larger than 5 MB.');
    this.name = 'InvalidRecipePhotoError';
  }
}

export function createS3RecipePhotoStore(
  bucket: string,
  client = new S3Client({ requestChecksumCalculation: 'WHEN_REQUIRED' }),
): RecipePhotoStore {
  async function publish(
    recipeId: string,
    temporaryKey: string,
    deleteTemporary: boolean,
  ): Promise<void> {
    const head = await client.send(
      new HeadObjectCommand({ Bucket: bucket, Key: temporaryKey }),
    );
    const body = await client.send(
      new GetObjectCommand({
        Bucket: bucket,
        Key: temporaryKey,
        Range: 'bytes=0-15',
      }),
    );
    const bytes = await body.Body?.transformToByteArray();
    const contentType = bytes === undefined ? undefined : photoType(bytes);

    if (
      head.ContentLength === undefined ||
      head.ContentLength <= 0 ||
      head.ContentLength > maxRecipePhotoBytes ||
      contentType === undefined ||
      head.ContentType !== contentType
    ) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: temporaryKey }),
      );
      throw new InvalidRecipePhotoError();
    }

    await client.send(
      new CopyObjectCommand({
        Bucket: bucket,
        CacheControl: 'private, max-age=300',
        ContentDisposition: 'inline',
        ContentType: contentType,
        CopySource: `${bucket}/${temporaryKey}`,
        Key: photoKey(recipeId),
        MetadataDirective: 'REPLACE',
      }),
    );
    if (deleteTemporary) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: temporaryKey }),
      );
    }
  }

  return {
    async completeUpload(recipeId, uploadId) {
      const temporaryKey = uploadKey(recipeId, uploadId);
      await publish(recipeId, temporaryKey, true);
    },

    createUpload(recipeId, uploadId, contentType) {
      return getSignedUrl(
        client,
        new PutObjectCommand({
          Bucket: bucket,
          ContentType: contentType,
          Key: uploadKey(recipeId, uploadId),
        }),
        { expiresIn: signedUrlLifetimeSeconds },
      );
    },

    async delete(recipeId) {
      await client.send(
        new DeleteObjectCommand({ Bucket: bucket, Key: photoKey(recipeId) }),
      );
    },

    publishImport(recipeId, importId) {
      return publish(recipeId, importKey(importId), false);
    },

    async stageImport(importId, bytes, contentType) {
      if (
        bytes.byteLength === 0 ||
        bytes.byteLength > maxRecipePhotoBytes ||
        photoType(bytes) !== contentType
      ) {
        throw new InvalidRecipePhotoError();
      }
      await client.send(
        new PutObjectCommand({
          Body: bytes,
          Bucket: bucket,
          ContentType: contentType,
          Key: importKey(importId),
        }),
      );
    },

    viewUrl(recipeId) {
      return getSignedUrl(
        client,
        new GetObjectCommand({
          Bucket: bucket,
          Key: photoKey(recipeId),
          ResponseCacheControl: 'private, max-age=300',
          ResponseContentDisposition: 'inline',
        }),
        { expiresIn: signedUrlLifetimeSeconds },
      );
    },
  };
}

export function photoType(
  bytes: Uint8Array,
): RecipePhotoContentType | undefined {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (
    startsWith(bytes, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(bytes.subarray(8), [0x57, 0x45, 0x42, 0x50])
  ) {
    return 'image/webp';
  }
  return undefined;
}

function startsWith(
  bytes: Uint8Array,
  signature: ReadonlyArray<number>,
): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function photoKey(recipeId: string): string {
  return `recipes/${recipeId}`;
}

function importKey(importId: string): string {
  return `uploads/imports/${importId}`;
}

function uploadKey(recipeId: string, uploadId: string): string {
  return `uploads/${recipeId}/${uploadId}`;
}
