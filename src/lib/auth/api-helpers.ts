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

export async function apiFetch<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, options);
  const json = await res.json();
  if (!res.ok) {
    // if (res.status === 401 && typeof window !== "undefined") {
    //   window.location.href = `/auth/login?next=${encodeURIComponent(window.location.pathname)}`;
    // }
    throw new Error(json.error ?? "Request failed");
  }
  return json as T;
}
