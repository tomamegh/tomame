import { cn } from "@/lib/utils";

interface PolicyHtmlProps {
  content: string;
  className?: string;
}

/**
 * Renders HTML produced by the Tiptap rich-text editor on the public policies
 * page. Content is admin-authored only (never user-supplied), so
 * dangerouslySetInnerHTML is appropriate here.
 */
export function PolicyHtml({ content, className }: PolicyHtmlProps) {
  if (!content?.trim()) {
    return (
      <p className="text-sm italic text-stone-400">
        This policy has no content yet.
      </p>
    );
  }

  return (
    <div
      className={cn(
        "prose prose-stone max-w-none",
        "prose-headings:font-bold prose-headings:text-stone-900",
        "prose-p:text-stone-600 prose-p:leading-relaxed",
        "prose-li:text-stone-600",
        "prose-a:text-rose-600 prose-a:no-underline hover:prose-a:underline",
        "prose-strong:text-stone-800",
        "prose-blockquote:border-rose-300 prose-blockquote:text-stone-500",
        "[&_table]:w-full [&_table]:border-collapse [&_table]:overflow-hidden [&_table]:rounded-xl [&_table]:border [&_table]:border-stone-200",
        "[&_thead]:bg-stone-50",
        "[&_th]:px-4 [&_th]:py-3 [&_th]:text-left [&_th]:text-sm [&_th]:font-semibold [&_th]:text-stone-700",
        "[&_td]:border-t [&_td]:border-stone-100 [&_td]:px-4 [&_td]:py-3 [&_td]:text-sm [&_td]:text-stone-600",
        className,
      )}
      dangerouslySetInnerHTML={{ __html: content }}
    />
  );
}
