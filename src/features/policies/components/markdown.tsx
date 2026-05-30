"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";

interface MarkdownProps {
  /** Raw markdown source to render. */
  content: string;
  /** Extra classes merged onto the `prose` wrapper. */
  className?: string;
}

/**
 * Renders policy markdown with GitHub-flavored markdown (tables, lists, etc.).
 * Tables are wrapped so they stay readable on small screens. The `prose`
 * styling is supplied by the caller via `className` so each surface (public
 * page vs. editor preview) controls its own typographic scale.
 */
export function Markdown({ content, className }: MarkdownProps) {
  return (
    <div
      className={cn(
        "prose prose-stone max-w-none",
        "prose-headings:font-bold prose-headings:text-stone-900",
        "prose-p:text-stone-600 prose-p:leading-relaxed",
        "prose-li:text-stone-600",
        "prose-a:text-rose-600 prose-a:no-underline hover:prose-a:underline",
        className,
      )}
    >
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          table: ({ children }) => (
            <div className="not-prose my-6 overflow-x-auto rounded-xl border border-stone-200">
              <table className="w-full text-sm">{children}</table>
            </div>
          ),
          thead: ({ children }) => (
            <thead className="border-b border-stone-200 bg-stone-50">
              {children}
            </thead>
          ),
          tbody: ({ children }) => (
            <tbody className="divide-y divide-stone-100">{children}</tbody>
          ),
          th: ({ children }) => (
            <th className="px-4 py-3 text-left font-semibold text-stone-700">
              {children}
            </th>
          ),
          td: ({ children }) => (
            <td className="px-4 py-3 text-stone-600">{children}</td>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
