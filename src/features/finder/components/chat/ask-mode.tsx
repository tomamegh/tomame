"use client";

import { useMemo } from "react";

import { AskPanel } from "@/features/extraction/components/ask-panel";
import { PasteBatchPanel } from "@/features/extraction/components/paste-batch-panel";
import { usePastes } from "@/features/extraction/hooks/usePastes";
import type { PasteStatus } from "@/features/extraction/services/paste-status";

/** Buy for me's "Ask a buyer" door: the hand-off form and the links a buyer already holds. */
export function AskMode({ initialPastes, renderedAt }: { initialPastes: PasteStatus[]; renderedAt: string }) {
  const { data: pastes } = usePastes(initialPastes);
  const held = useMemo(() => pastes.filter((p) => p.assisted != null && p.outcome !== "reading"), [pastes]);
  return <AskPanel requests={held} now={new Date(renderedAt)} />;
}

/**
 * One pasted link opened from history (`?watch=`), live: its reading, price
 * and actions, drawn as the thread draws a link. Mounted only when asked for,
 * so a plain chat never polls the paste list.
 */
export function WatchedPaste({ initialPastes, id, onDescribe }: { initialPastes: PasteStatus[]; id: string; onDescribe: (paste: PasteStatus) => void }) {
  const { data: pastes } = usePastes(initialPastes);
  const paste = pastes.find((p) => p.id === id);
  return paste ? <PasteBatchPanel pastes={[paste]} onDescribe={onDescribe} /> : null;
}
