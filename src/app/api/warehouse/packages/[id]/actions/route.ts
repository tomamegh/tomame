import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { packageActionSchema } from "@/features/warehouse/schema";
import {
  getWarehousePackage,
  recordLabelPrint,
  reopenWarehousePackage,
  sealWarehousePackage,
  shipWarehousePackage,
} from "@/features/warehouse/services/warehouse.service";

type Ctx = { params: Promise<{ id: string }> };

/**
 * `POST /api/warehouse/packages/:id/actions` — `{ action }`, one of seal,
 * reopen, ship, label_printed. Status changes are explicit verbs, never a
 * status field in a PATCH, so an edit form can never ship a package by accident.
 */
export async function POST(request: NextRequest, { params }: Ctx) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const { id } = await params;
    const parsed = packageActionSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");

    switch (parsed.data.action) {
      case "seal":
        return successResponse({ package: await sealWarehousePackage(user, id), failed: [] });
      case "reopen":
        return successResponse({ package: await reopenWarehousePackage(user, id), failed: [] });
      case "ship":
        return successResponse(
          await shipWarehousePackage(user, id, {
            carrier: parsed.data.carrier,
            tracking_number: parsed.data.tracking_number,
          }),
        );
      case "label_printed":
        await recordLabelPrint(user, id);
        return successResponse({ package: await getWarehousePackage(user, id), failed: [] });
    }
  } catch (error) {
    return errorResponse(error);
  }
}
