// file: middleware.ts
import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/proxy';

export async function proxy(request: NextRequest) {
  // This refreshes the user session and must be done before protected routes
  return await updateSession(request);
}

export const config = {
  matcher: [
    // Protected routes
    // '/dashboard/:path*',
    // '/api/(?!auth|shipping)/:path*',
    // // Auth routes
    // '/auth/:path*',
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"
  ],
};
