import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock("@/features/media/services/image-upload", () => ({
  encodeImageUpload: vi.fn(),
  putImageObject: vi.fn(async () => undefined),
  getImageObject: vi.fn(),
  removeImageObject: vi.fn(async () => undefined),
  randomObjectName: () => "aaaabbbbccccdddd",
}));

import {
  encodeImageUpload,
  getImageObject,
  putImageObject,
  removeImageObject,
} from "@/features/media/services/image-upload";
import {
  PARCEL_PHOTO_BUCKET,
  deleteParcelPhoto,
  encodeParcelPhoto,
  parcelPhotoStoragePath,
  putParcelPhoto,
  readParcelPhoto,
} from "../services/parcel-photos.service";

const ORDER = "7d0a9c6e-0e7a-4c2b-9c5d-1d2e3f4a5b6c";

const encoded = {
  data: Buffer.from("webp-bytes"),
  width: 1200,
  height: 900,
  byteSize: 10,
  contentType: "image/webp" as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(encodeImageUpload).mockResolvedValue(encoded);
});

describe("parcelPhotoStoragePath", () => {
  // The constraint migration 054 calls "the one that matters": a photo of order
  // A must never be able to name an object under order B, or the serving route
  // hands the wrong customer the wrong parcel with its ownership check passing.
  it("always builds the key under the given order's own prefix", () => {
    expect(parcelPhotoStoragePath(ORDER)).toBe(`orders/${ORDER}/aaaabbbbccccdddd.webp`);
  });

  it("matches the shape the database CHECKs", () => {
    expect(parcelPhotoStoragePath(ORDER)).toMatch(
      /^orders\/[0-9a-f-]{36}\/[A-Za-z0-9][A-Za-z0-9._-]*$/,
    );
  });
});

describe("putParcelPhoto", () => {
  it("writes into the private parcel bucket under the order prefix", async () => {
    const stored = await putParcelPhoto(ORDER, encoded);

    expect(stored.storagePath.startsWith(`orders/${ORDER}/`)).toBe(true);
    expect(putImageObject).toHaveBeenCalledWith(
      PARCEL_PHOTO_BUCKET,
      stored.storagePath,
      encoded.data,
      expect.objectContaining({ cacheControl: expect.stringContaining("private") }),
    );
  });

  // The row records what sharp produced, never anything the upload claimed.
  it("returns the re-encoded measurements", async () => {
    await expect(putParcelPhoto(ORDER, encoded)).resolves.toMatchObject({
      width: 1200,
      height: 900,
      byteSize: 10,
      contentType: "image/webp",
    });
  });
});

describe("encode, read and delete", () => {
  it("re-encodes through the shared pipeline rather than its own copy", async () => {
    await expect(encodeParcelPhoto(ORDER, Buffer.from("raw"))).resolves.toBe(encoded);
    expect(encodeImageUpload).toHaveBeenCalledWith(Buffer.from("raw"), `parcel:${ORDER}`);
  });

  it("reads and removes from the parcel bucket only", async () => {
    vi.mocked(getImageObject).mockResolvedValue(null);

    await readParcelPhoto(`orders/${ORDER}/x.webp`);
    await deleteParcelPhoto(`orders/${ORDER}/x.webp`);

    expect(getImageObject).toHaveBeenCalledWith(PARCEL_PHOTO_BUCKET, `orders/${ORDER}/x.webp`);
    expect(removeImageObject).toHaveBeenCalledWith(PARCEL_PHOTO_BUCKET, `orders/${ORDER}/x.webp`);
  });
});
