import { ApiSuccessResponse } from "@/types/api";
import { NextResponse } from "next/server";


export class APIError extends Error {
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

export function errorResponse(error: unknown, statusCode: number = 500) {
  if (error instanceof APIError) {
    return NextResponse.json(
      { error: error.message, success: false },
      { status: error.statusCode },
    );
  }

  const message = error instanceof Error ? error.message : "An error occurred";
  return NextResponse.json(
    { error: message, success: false },
    { status: statusCode },
  );
}

export class ApiFetchError extends Error {
  constructor(message: string, public status: number) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new ApiFetchError(json.error ?? "Request failed", res.status);
  }
  return json as T;
}
