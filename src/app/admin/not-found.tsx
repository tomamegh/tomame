import Link from "next/link";
import { ArrowLeftIcon, SearchXIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function NotFound() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center min-h-[60vh] gap-6 text-center px-4">
      <div className="flex items-center justify-center size-20 rounded-2xl bg-stone-100 border border-stone-200/60">
        <SearchXIcon className="size-9 text-stone-400" />
      </div>

      <div className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-widest text-stone-400">
          404
        </p>
        <h1 className="text-2xl font-bold text-stone-800">Page not found</h1>
        <p className="text-sm text-stone-500 max-w-xs">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>
      </div>

      <Button variant="outline" size="sm" asChild>
        <Link href="/admin" className="gap-2">
          <ArrowLeftIcon className="size-3.5" />
          Back to dashboard
        </Link>
      </Button>
    </div>
  );
}
