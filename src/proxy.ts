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
    //
    // This USED to exclude any path ending in an image extension
    // (`.*\.(?:svg|png|jpg|jpeg|gif|webp)$`), on the theory that those are
    // static assets. They are not, in general — they're just paths that end
    // in one of those extensions. `GET /admin/orders/x.png` matched that
    // exclusion, so it reached the `/admin/orders/[id]` page component with
    // NO session check at all: `updateSession` never ran, so `canAccessAdmin`
    // never ran. Verified live: it answered 500 today only because "x" isn't
    // a UUID, not because anything gated it — a page that accepted a
    // string id there would have served a service-role-fetched order to
    // anyone, unauthenticated.
    //
    // Real static assets live under a handful of known paths — `_next/static`,
    // `favicon.ico`, the App Router metadata files, and the two `public/`
    // folders the app serves from (`/images`, `/icons`) — so those are what's
    // excluded now, by path, not by guessing from the extension on whatever
    // the route happens to be. `_next/image` is deliberately NOT excluded:
    // `updateSession` in `src/lib/supabase/proxy.ts` inspects it (the
    // open-image-proxy fix's graceful-degradation half) before Next's own
    // image handler ever sees the request.
    //
    // `sw.js` and `manifest.webmanifest` are excluded for a reason beyond
    // cost. The service worker is fetched by the browser's worker thread with
    // no cookies attached in some update paths, and the manifest is fetched
    // cross-context; running either through the Supabase session refresh
    // achieves nothing and risks issuing a `Set-Cookie` on a response the page
    // never sees. Neither is HTML, so neither needs the CSP.
    //
    // `/offline` is deliberately NOT excluded, though it was at first. It is an
    // HTML document, and `updateSession` is where the Content-Security-Policy
    // header is set — excluding it made it the one page in the app served with
    // no CSP at all. It needs no exclusion to be reachable either: it is not
    // under `/app` or `/admin`, so the proxy already lets it through with no
    // session.
    "/((?!_next/static|favicon\\.ico|icon\\.png|apple-icon\\.png|opengraph-image\\.png|sw\\.js|manifest\\.webmanifest|images/|icons/).*)",
  ],
};
