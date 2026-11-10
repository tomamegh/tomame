import type { NextRequest } from "next/server";

import { MAX_UPLOAD_BYTES } from "@/features/media/services/image-upload";
import { uploadDeliveryPhotos } from "@/features/drivers/services/driver.service";
import { APIError, errorResponse, successResponse } from "@/lib/auth/api-helpers";
import { authenticateDelivery } from "@/lib/auth/warehouse-route";

type Ctx = { params: Promise<{ orderId: string }> };

/** A hand-over is one or two pictures. */
const MAX_PHOTOS = 4;

/** `POST /api/driver/deliveries/:orderId/photos` — multipart `file`: the hand-over photo (102). */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateDelivery(request, "write");
    const { orderId } = await params;
    const form = await request.formData().catch(() => {
      throw new APIError(400, "Expected a multipart upload");
    });
    const files = form.getAll("file").filter((entry): entry is File => entry instanceof File);
    if (files.length === 0) throw new APIError(400, "No photo was uploaded.");
    if (files.length > MAX_PHOTOS) throw new APIError(400, `Send at most ${MAX_PHOTOS} photos at once.`);
    for (const file of files) {
      if (file.size > MAX_UPLOAD_BYTES) throw new APIError(413, "That photo is too large.");
    }
    const buffers = await Promise.all(files.map(async (f) => Buffer.from(await f.arrayBuffer())));
    return successResponse({ stored: await uploadDeliveryPhotos(user, orderId, buffers) }, 201);
  } catch (error) {
    return errorResponse(error);
  }
}
