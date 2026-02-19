import { NextResponse } from "next/server";
import type { ApiSuccessResponse, ApiErrorResponse } from "@/types/api";

export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function successResponse<T>(data: T, status = 200) {
  const body: ApiSuccessResponse<T> = { success: true, data };
  return NextResponse.json(body, { status });
}

export function errorResponse(error: string, status: number) {
  const body: ApiErrorResponse = { success: false, error };
  return NextResponse.json(body, { status });
}
