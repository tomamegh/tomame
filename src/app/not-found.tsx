import { NotFoundButtons } from "@/components";


export default function NotFound() {
  return (
    <main className="min-h-screen relative flex items-center justify-center p-4 sm:p-8 bg-white overflow-hidden">
      {/* Subtle gradient blobs */}
      <div
        aria-hidden
        className="absolute top-0 left-0 w-[40vw] h-[40vw] max-w-lg max-h-lg rounded-full bg-rose-100/60 blur-3xl -translate-x-1/2 -translate-y-1/2 pointer-events-none"
      />
      <div
        aria-hidden
        className="absolute bottom-0 right-0 w-[40vw] h-[40vw] max-w-lg max-h-lg rounded-full bg-amber-100/60 blur-3xl translate-x-1/2 translate-y-1/2 pointer-events-none"
      />

      <div className="relative z-10 w-full max-w-lg text-center space-y-8 px-4">
        {/* Big 404 */}
        <div className="space-y-1">
          <p className="text-8xl sm:text-9xl font-black bg-linear-to-r from-rose-500 via-orange-500 to-amber-500 bg-clip-text text-transparent leading-none select-none">
            404
          </p>
          <p className="text-xs font-semibold tracking-widest uppercase text-stone-400">
            Page not found
          </p>
        </div>

        <div className="space-y-2">
          <h1 className="text-2xl sm:text-3xl font-bold text-stone-800">
            This page doesn&apos;t exist
          </h1>
          <p className="text-stone-400 text-sm sm:text-base max-w-sm mx-auto">
            The URL may be mistyped, or the page may have been moved or removed.
          </p>
        </div>

        <NotFoundButtons />

        <p className="text-xs text-stone-300">
          Tomame &mdash; Global product sourcing
        </p>
      </div>
    </main>
  );
}
