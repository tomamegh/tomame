import { NextRequest, NextResponse } from "next/server";

// Moved to /api/app/me
export async function GET() {
  return NextResponse.redirect(
    new URL("/api/app/me", process.env.NEXT_PUBLIC_APP_URL),
    308,
  );
}

export async function PATCH(request: NextRequest) {
  return NextResponse.redirect(
    new URL("/api/app/me", process.env.NEXT_PUBLIC_APP_URL),
    308,
  );
}
