"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { MagnifyingGlass } from "@phosphor-icons/react";

import { haptic } from "@/lib/native/bridge";
import { sendToBuyForMe } from "../send";
import { shortLink } from "../format";
import { Tap } from "./tap";

/** Reads one product link and replaces itself with its product screen (or the chat). */
export function PriceHandoff({ url }: { url: string | null }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const started = useRef(false);

  useEffect(() => {
    if (!url || started.current) return;
    started.current = true;
    sendToBuyForMe(url).then(
      (to) => router.replace(to),
      (e: unknown) => {
        haptic("error");
        setError(e instanceof Error ? e.message : "Something went wrong reading that link.");
      },
    );
  }, [url, router]);

  if (!url || error) {
    return (
      <div className="empty">
        <MagnifyingGlass size={48} />
        <h3>We couldn&apos;t take that link</h3>
        <p>{error ?? "There was no link to read."} Paste it into Buy for me instead.</p>
        <Tap href="/m/chat" className="btn btn-primary">Open Buy for me</Tap>
      </div>
    );
  }
  return (
    <div className="empty">
      <div className="shimmer" style={{ width: 120, height: 120, margin: "0 auto 16px", borderRadius: 26 }} />
      <h3>Reading this page</h3>
      <p>{shortLink(url)}</p>
      <p className="fine">Pricing it to your door in Accra…</p>
    </div>
  );
}
