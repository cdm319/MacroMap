import {
  CopyObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3';
import { describe, expect, it, vi } from 'vitest';
import {
  createS3RecipePhotoStore,
  InvalidRecipePhotoError,
  photoType,
} from './recipe-photo-store.js';

describe('recipe photo signatures', () => {
  it.each([
    [[0xff, 0xd8, 0xff, 0xe0], 'image/jpeg'],
    [[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 'image/png'],
    [
      [0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50],
      'image/webp',
    ],
  ] as const)('recognises a supported image', (bytes, expected) => {
    expect(photoType(Uint8Array.from(bytes))).toBe(expected);
  });

  it('rejects content without a supported signature', () => {
    expect(photoType(new TextEncoder().encode('not an image'))).toBeUndefined();
  });

  it('publishes a validated staged upload and removes the temporary object', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ContentLength: 4, ContentType: 'image/jpeg' })
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(Uint8Array.from([0xff, 0xd8, 0xff, 0xe0])),
        },
      })
      .mockResolvedValue({});
    const store = createS3RecipePhotoStore('photo-bucket', {
      send,
    } as unknown as S3Client);

    await store.completeUpload('recipe-id', 'upload-id');

    expect(send.mock.calls.map(([command]) => command.constructor)).toEqual([
      HeadObjectCommand,
      GetObjectCommand,
      CopyObjectCommand,
      DeleteObjectCommand,
    ]);
  });

  it('deletes a staged upload with an invalid signature', async () => {
    const send = vi
      .fn()
      .mockResolvedValueOnce({ ContentLength: 4, ContentType: 'image/jpeg' })
      .mockResolvedValueOnce({
        Body: {
          transformToByteArray: () =>
            Promise.resolve(new TextEncoder().encode('text')),
        },
      })
      .mockResolvedValueOnce({});
    const store = createS3RecipePhotoStore('photo-bucket', {
      send,
    } as unknown as S3Client);

    await expect(
      store.completeUpload('recipe-id', 'upload-id'),
    ).rejects.toBeInstanceOf(InvalidRecipePhotoError);
    expect(send.mock.calls[2]?.[0]).toBeInstanceOf(DeleteObjectCommand);
  });
});
