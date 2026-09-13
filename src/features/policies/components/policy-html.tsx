"use client";

import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

interface PolicyHtmlProps {
  content: string;
  className?: string;
}

/**
 * Two things write `policies.content`, and they do not agree on a format.
 *
 * The admin editor is Tiptap, which emits HTML. `supabase/seeds/policies.sql`
 * writes MARKDOWN (`### Heading`, `- **bold**`), and every one of the five
 * policies on every environment came from that seed. This component only ever
 * did `dangerouslySetInnerHTML`, so all five rendered as raw markdown source to
 * customers — literal `###` and `**` on the pages the footer and the bag's pay
 * button link to.
 *
 * So it now renders whichever format the row actually holds. Tiptap always wraps
 * its output in a block element, so a leading `<` is a reliable tell; anything
 * else is markdown and goes through `react-markdown`, which is what
 * `features/policies/types.ts` documented the column as all along.
 *
 * Both paths are admin-authored content, never user-supplied, which is what
 * makes `dangerouslySetInnerHTML` acceptable on the HTML branch.
 */
export function PolicyHtml({ content, className }: PolicyHtmlProps) {
  if (!content?.trim()) {
    return (
      <p className="text-sm text-stone-400 italic">
        This policy has no content yet.
      </p>
    );
  }

  if (!isHtml(content)) {
    return <Markdown content={content} className={className} />;
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

/**
 * Tiptap wraps everything it emits — the shortest possible document is
 * `<p></p>` — so content that opens with a tag came from the editor. Markdown
 * that happens to open with raw HTML renders as HTML too, which is the same
 * thing `react-markdown` would have done with it.
 */
export function isHtml(content: string): boolean {
  return /^\s*</.test(content);
}
