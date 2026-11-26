"use client";

import { useState } from "react";

import { Button } from "@/components/ui/button";
import { resolveChosenOptions } from "@/features/extraction/item-options";
import { ItemOptionsCard } from "@/features/quotes/components/item-options-card";
import { toast } from "@/lib/sonner";
import { useUpdateBagLine } from "../hooks/useBag";
import type { BagLine } from "../types";

/**
 * A bag line that still needs its size or colour (142): asked right on the
 * line, because Pay waits for it and staff buy from the answer. Lines come here
 * unanswered from the paste queue, a sourcing request, or a quote added before
 * the question existed.
 */
export function BagLineOptions({ line }: { line: BagLine }) {
  const update = useUpdateBagLine();
  const [draft, setDraft] = useState<Record<string, string>>(line.options?.chosen ?? {});
  const options = line.options;
  if (!options || options.missing.length === 0) return null;

  const open = options.questions.filter((q) => !q.pinned && options.missing.includes(q.name));
  const { missing } = resolveChosenOptions(open, draft);

  const save = () =>
    update.mutate(
      { id: line.id, chosen_options: resolveChosenOptions(open, draft).chosen },
      {
        onError: (error) => toast.error({ title: "Could not save that", description: error.message }),
      },
    );

  return (
    <div className="flex flex-col gap-2.5 rounded-[14px] border border-tm-coral/40 bg-tm-tint/40 p-1">
      <ItemOptionsCard
        className="border-0 bg-transparent p-3"
        questions={open}
        value={draft}
        onChange={(name, value) => setDraft((prev) => ({ ...prev, [name]: value }))}
        missing={missing}
        note="We buy exactly what you choose, so check it against the store's page. Pay opens once it's set."
      />
      <Button
        variant="primary"
        size="sm"
        className="mx-3 mb-3 self-start"
        disabled={missing.length > 0}
        loading={update.isPending}
        onClick={save}
      >
        Save {open.map((q) => q.name.toLowerCase()).join(" and ")}
      </Button>
    </div>
  );
}
