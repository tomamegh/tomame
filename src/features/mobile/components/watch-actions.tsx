"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash } from "@phosphor-icons/react";

import { haptic } from "@/lib/native/bridge";
import { toast } from "@/lib/sonner";
import { useCreateWatch, useDeleteWatch } from "@/features/watches/hooks/useWatches";

/** Paste a product link to start watching its landed price. */
export function AddWatch() {
  const router = useRouter();
  const create = useCreateWatch();
  const [url, setUrl] = useState("");
  return (
    <form
      className="add-watch"
      onSubmit={(e) => {
        e.preventDefault();
        if (!url.trim()) return;
        haptic("medium");
        create.mutate(
          { url: url.trim() },
          {
            onSuccess: (r) => {
              haptic("success");
              setUrl("");
              toast.success({ title: r.created ? "Watching it" : "Already watching", description: "You'll hear the minute it drops." });
              router.refresh();
            },
            onError: (err) => {
              haptic("error");
              toast.error({ title: "Could not watch that", description: err.message });
            },
          },
        );
      }}
    >
      <input inputMode="url" placeholder="Paste a product link to watch" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Product link" />
      <button type="submit" className="btn btn-primary" disabled={!url.trim() || create.isPending}>
        <Plus size={16} weight="bold" />
        {create.isPending ? "Adding…" : "Watch"}
      </button>
    </form>
  );
}

/** Stop watching. */
export function StopWatching({ id }: { id: string }) {
  const router = useRouter();
  const del = useDeleteWatch();
  return (
    <button
      type="button"
      className="btn btn-ghost"
      disabled={del.isPending}
      onClick={() => {
        haptic("medium");
        del.mutate({ id }, { onSuccess: () => router.refresh(), onError: (e) => toast.error({ title: "Could not stop it", description: e.message }) });
      }}
    >
      <Trash size={16} />
      Stop
    </button>
  );
}
