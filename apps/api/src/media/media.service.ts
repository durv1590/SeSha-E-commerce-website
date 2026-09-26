import { HttpStatus, Injectable } from '@nestjs/common';
import type { MediaUploadDto } from '@seshakart/types';
import sharp from 'sharp';
import { randomBytes } from 'node:crypto';
import { AppException } from '../common/filters/all-exceptions.filter';
import { PrismaService } from '../database/prisma.service';
import { StorageService } from '../storage/storage.service';

type ImageMetadata = Awaited<ReturnType<ReturnType<typeof sharp>['metadata']>>;
type EncodedImage = { data: Buffer; info: { width: number; height: number; size: number } };

export const MAX_UPLOAD_BYTES = 8 * 1024 * 1024;
/** Raster formats only: SVG can carry scripts and is never accepted. */
const ACCEPTED = new Set(['jpeg', 'png', 'webp', 'avif', 'gif']);
/** Rejects decompression bombs (a small file that expands to billions of pixels). */
const MAX_INPUT_PIXELS = 60_000_000;

export interface UploadedFile {
  buffer: Buffer;
  size: number;
}

/**
 * Safe image uploads. The file's real type is determined by decoding it (the name
 * and declared MIME type are ignored), then it is re-encoded to WebP: EXIF metadata
 * (including GPS) is stripped, orientation applied and oversized images scaled down.
 * Stored under a random lowercase key, so user-chosen names never reach the file system.
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async upload(
    file: UploadedFile | undefined,
    actorId: string | null,
    opts: { maxSide?: number; minSide?: number } = {},
  ): Promise<MediaUploadDto> {
    const invalid = (code: string, message: string) =>
      new AppException(HttpStatus.UNPROCESSABLE_ENTITY, code, message);
    if (!file?.buffer?.length) throw invalid('FILE_REQUIRED', 'Choose an image to upload.');
    if (file.size > MAX_UPLOAD_BYTES)
      throw invalid('FILE_TOO_LARGE', 'Images must be 8 MB or smaller.');

    let meta: ImageMetadata;
    try {
      meta = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
    } catch {
      throw invalid('INVALID_IMAGE', 'This file isn’t a valid image.');
    }
    if (!meta.format || !ACCEPTED.has(meta.format))
      throw invalid('UNSUPPORTED_IMAGE', 'Use a JPEG, PNG, WebP, AVIF or GIF image.');
    const minSide = opts.minSide ?? 200;
    if ((meta.width ?? 0) < minSide || (meta.height ?? 0) < minSide)
      throw invalid('IMAGE_TOO_SMALL', `Images must be at least ${minSide} × ${minSide} pixels.`);

    let out: EncodedImage;
    try {
      const maxSide = opts.maxSide ?? 2000;
      out = await sharp(file.buffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: maxSide, height: maxSide, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });
    } catch {
      throw invalid('INVALID_IMAGE', 'This image couldn’t be processed.');
    }
    const now = new Date();
    const key = `uploads/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, '0')}/${randomBytes(10).toString('hex')}.webp`;
    const url = await this.storage.put(key, out.data);
    const asset = await this.prisma.mediaAsset.create({
      data: {
        storageKey: key,
        url,
        mimeType: 'image/webp',
        sizeBytes: out.data.length,
        width: out.info.width,
        height: out.info.height,
        createdById: actorId,
      },
    });
    return {
      id: asset.id,
      url,
      width: out.info.width,
      height: out.info.height,
      sizeBytes: out.data.length,
    };
  }
}
