"use client";

import { MAX_OPTION_VALUE_LENGTH, type ItemOptionQuestion } from "@/features/extraction/item-options";
import { cn } from "@/lib/utils";

export interface ItemOptionsCardProps {
  /** Only the questions the customer still has to answer (not pinned by the link). */
  questions: ItemOptionQuestion[];
  value: Record<string, string>;
  onChange: (name: string, value: string) => void;
  /** Option names still unanswered; drawn as required. */
  missing: string[];
  /** One line under the questions, e.g. how to change an option the link already fixes. */
  note?: string | null;
  className?: string;
}

/**
 * "Which size?" (142). The store's own values as buttons when it listed them,
 * a short text box when it did not (a dress page that names no sizes still
 * comes in sizes). The answer goes with the line to the order, where staff buy
 * from it; nothing here prices anything.
 */
export function ItemOptionsCard({ questions, value, onChange, missing, note, className }: ItemOptionsCardProps) {
  if (questions.length === 0) return null;
  return (
    <section className={cn("flex flex-col gap-4 rounded-[18px] border border-border bg-card p-[18px]", className)}>
      {questions.map((q) => {
        const isMissing = missing.includes(q.name);
        const inputId = `item-option-${q.name.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`;
        return (
          <div key={q.name} className="flex flex-col gap-2.5">
            <h2 className="text-sm leading-none font-semibold">
              {q.values.length > 0 ? (
                q.name
              ) : (
                <label htmlFor={inputId}>Your {q.name.toLowerCase()}</label>
              )}
              {value[q.name] ? (
                <span className="font-normal text-tm-text-3"> · {value[q.name]}</span>
              ) : (
                <span className={cn("font-normal", isMissing ? "text-tm-coral-strong" : "text-tm-text-3")}> · required</span>
              )}
            </h2>
            {q.values.length > 0 ? (
              <div className="flex flex-wrap gap-2" role="group" aria-label={q.name}>
                {q.values.map((v) => {
                  const selected = value[q.name]?.toLowerCase() === v.toLowerCase();
                  return (
                    <button
                      key={v}
                      type="button"
                      aria-pressed={selected}
                      onClick={() => onChange(q.name, v)}
                      className={cn(
                        "min-h-9 rounded-full border px-3.5 py-1.5 text-xs leading-none transition-colors",
                        selected
                          ? "border-tm-coral bg-tm-tint font-semibold text-tm-coral-strong"
                          : "border-border bg-[var(--tm-pill-bg)] font-medium text-foreground hover:border-tm-coral/60",
                      )}
                    >
                      {v}
                    </button>
                  );
                })}
              </div>
            ) : (
              <input
                id={inputId}
                type="text"
                inputMode="text"
                autoComplete="off"
                maxLength={MAX_OPTION_VALUE_LENGTH}
                value={value[q.name] ?? ""}
                onChange={(e) => onChange(q.name, e.target.value)}
                placeholder={q.name === "Size" ? "As the store writes it, e.g. M, UK 10, 38" : `As the store writes it`}
                className="h-10 rounded-[12px] border border-border bg-background px-3 text-sm outline-none placeholder:text-tm-text-3 focus-visible:border-tm-coral"
              />
            )}
          </div>
        );
      })}
      <p className="text-xs leading-snug text-tm-text-3">
        {note ?? "We buy exactly what you choose here, so check it against the store's page."}
      </p>
    </section>
  );
}
