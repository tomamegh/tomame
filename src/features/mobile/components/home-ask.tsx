"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowUp, ClipboardText, LinkSimple } from "@phosphor-icons/react";
import { toast } from "@/lib/sonner";

import { haptic } from "@/lib/native/bridge";
import { firstUrl, shortLink } from "../format";
import { sendToBuyForMe } from "../send";

/**
 * The big ask box on Home. Words or a link go to Buy for me as a new chat turn, exactly as the
 * website's chat sends them (`POST /api/finder/chat`); a single priced link opens its product.
 * The Paste button fills the box; a pasted link is also offered as a one-tap "Price it".
 * The clipboard is never read on its own: iOS would stop the app with a paste alert.
 */
export function HomeAsk() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [text, setText] = useState("");
  // A link the customer pasted with the Paste button, offered as a one-tap price.
  const [clip, setClip] = useState<string | null>(null);

  const submit = (value: string) => {
    const v = value.trim();
    if (!v || busy) return;
    haptic("medium");
    setBusy(true);
    sendToBuyForMe(v).then(
      (to) => router.push(to),
      (e: unknown) => {
        setBusy(false);
        haptic("error");
        toast.error({ title: "Could not reach Buy for me", description: e instanceof Error ? e.message : undefined });
      },
    );
  };

  return (
    <>
      <form
        className="ask up"
        onSubmit={(e) => {
          e.preventDefault();
          submit(text);
        }}
      >
        <textarea
          rows={2}
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              submit(text);
            }
          }}
          placeholder="Paste a link or ask for anything…"
          aria-label="Paste a link or ask for anything"
          enterKeyHint="send"
        />
        <div className="ask-row">
          <button
            type="button"
            className="mini"
            onClick={async () => {
              haptic("light");
              // WebKit's own paste bubble, not the native clipboard read: iOS answers a
              // programmatic read with a blocking "would like to paste" alert every time.
              const v = (await navigator.clipboard?.readText().catch(() => "")) ?? "";
              if (!v) return;
              setText(v);
              setClip(firstUrl(v) && !v.replace(firstUrl(v)!, "").trim() ? firstUrl(v) : null);
            }}
          >
            <LinkSimple size={16} weight="bold" />
            Paste
          </button>
          <button type="submit" className="send" disabled={!text.trim() || busy} aria-label="Send">
            <ArrowUp size={20} weight="bold" />
          </button>
        </div>
      </form>
      {clip && (
        <button type="button" className="clip" onClick={() => submit(clip)} disabled={busy}>
          <span className="ic"><ClipboardText size={19} weight="fill" /></span>
          <span className="meta">
            <b>Price the link you copied?</b>
            <small>{shortLink(clip)}</small>
          </span>
          <span className="go">{busy ? "…" : "Price it"}</span>
        </button>
      )}
    </>
  );
}
