import type { NextRequest } from "next/server";

import { errorResponse, successResponse, APIError } from "@/lib/auth/api-helpers";
import { authenticateWarehouse, readJson } from "@/lib/auth/warehouse-route";
import { createPackageSchema } from "@/features/warehouse/schema";
import {
  createWarehousePackage,
  listWarehousePackages,
} from "@/features/warehouse/services/warehouse.service";
import type { PackageStatus } from "@/features/warehouse/types";

const STATUSES: PackageStatus[] = ["packing", "sealed", "shipped"];

/** `GET /api/warehouse/packages?status=sealed` */
export async function GET(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "read");
    const raw = request.nextUrl.searchParams.get("status");
    const status = STATUSES.find((s) => s === raw);
    return successResponse(await listWarehousePackages(user, { statuses: status ? [status] : undefined }));
  } catch (error) {
    return errorResponse(error);
  }
}

/** `POST /api/warehouse/packages` — a new package, optionally with its first items. */
export async function POST(request: NextRequest) {
  try {
    const user = await authenticateWarehouse(request, "write");
    const parsed = createPackageSchema.safeParse(await readJson(request));
    if (!parsed.success) throw new APIError(400, parsed.error.issues[0]?.message ?? "Invalid input");
    return successResponse(await createWarehousePackage(user, parsed.data), 201);
  } catch (error) {
    return errorResponse(error);
  }
}
