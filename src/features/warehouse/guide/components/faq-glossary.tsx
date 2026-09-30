"use client";

import { useDeferredValue, useState } from "react";
import { ArrowUpRightIcon, ChevronDownIcon, SearchIcon, XIcon } from "lucide-react";

import { cn } from "@/lib/utils";

import { FAQ, GLOSSARY, SECTIONS } from "../content";
import { searchEntries } from "../search";

/**
 * Searchable FAQ and glossary (081 guide). The search is a pure function
 * (`search.ts`) — every word must appear, in any order — so "label blurry"
 * finds "fuzzy or blurry".
 */

function SearchBox({ id, value, onChange, placeholder, count }: { id: string; value: string; onChange: (v: string) => void; placeholder: string; count: number }) {
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="sr-only">
        {placeholder}
      </label>
      <div className="relative flex items-center">
        <SearchIcon className="pointer-events-none absolute left-4 size-4 text-tm-text-3" aria-hidden />
        <input
          id={id}
          type="search"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete="off"
          className="h-12 w-full min-w-0 rounded-full border border-tm-border bg-card pr-11 pl-11 text-[14px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60 focus:ring-4 focus:ring-tm-coral/10 [&::-webkit-search-cancel-button]:hidden"
        />
        {value ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Clear search"
            className="absolute right-3 flex size-7 items-center justify-center rounded-full text-tm-text-3 hover:bg-tm-hairline hover:text-tm-ink"
          >
            <XIcon className="size-3.5" aria-hidden />
          </button>
        ) : null}
      </div>
      <span className="px-4 text-[12px] font-medium text-tm-text-3" aria-live="polite">
        {value ? `${count} match${count === 1 ? "" : "es"}` : ""}
      </span>
    </div>
  );
}

export function FaqList() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const results = searchEntries(FAQ, deferred);

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SearchBox id="faq-search" value={query} onChange={setQuery} placeholder="Search the FAQ, e.g. “label blurry” or “camera”" count={results.length} />
      {results.length === 0 ? (
        <p className="rounded-[20px] border border-dashed border-tm-border bg-card px-5 py-8 text-center text-[13.5px] font-medium text-tm-text-3">
          Nothing matches. Try one word, like “print”, “hold” or “scan”, or ask an admin.
        </p>
      ) : (
        <div className="flex flex-col divide-y divide-tm-hairline overflow-hidden rounded-[22px] border border-tm-border bg-card">
          {results.map((item) => {
            const section = item.section ? SECTIONS.find((s) => s.id === item.section) : undefined;
            return (
              <details key={item.id} className="group/faq" open={deferred.trim().length > 0 && results.length <= 3}>
                <summary className="flex cursor-pointer list-none items-center gap-3 px-5 py-4 transition-colors hover:bg-tm-paper/60 focus-visible:bg-tm-paper focus-visible:outline-none [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0 flex-1 text-[14px] font-semibold text-tm-ink">{item.q}</span>
                  <ChevronDownIcon className="size-4 shrink-0 text-tm-text-3 transition-transform group-open/faq:rotate-180" aria-hidden />
                </summary>
                <div className="flex flex-col gap-2 px-5 pb-4">
                  <p className="text-[13.5px] leading-[1.6] font-medium text-tm-text-2">{item.a}</p>
                  {section ? (
                    <a href={`#${section.id}`} className="inline-flex w-fit items-center gap-0.5 text-[12.5px] font-semibold text-tm-coral-strong underline-offset-2 hover:underline">
                      More in {section.label}
                      <ArrowUpRightIcon className="size-3.5" aria-hidden />
                    </a>
                  ) : null}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function GlossaryList() {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const results = searchEntries(GLOSSARY, deferred);
  const sorted = deferred.trim() ? results : [...results].sort((a, b) => a.q.localeCompare(b.q));

  return (
    <div className="flex min-w-0 flex-col gap-3">
      <SearchBox id="glossary-search" value={query} onChange={setQuery} placeholder="Look up a word" count={results.length} />
      <dl className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {sorted.map((term) => (
          <div key={term.id} className={cn("flex min-w-0 flex-col gap-1 rounded-[18px] border border-tm-border bg-card px-4 py-3.5")}>
            <dt className="text-[14px] font-bold text-tm-ink">{term.q}</dt>
            <dd className="text-[13px] leading-[1.5] font-medium text-tm-text-2">{term.a}</dd>
          </div>
        ))}
      </dl>
      {sorted.length === 0 ? <p className="text-[13.5px] font-medium text-tm-text-3">No word like that here yet.</p> : null}
    </div>
  );
}
