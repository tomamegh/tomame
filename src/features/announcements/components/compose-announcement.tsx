"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Megaphone } from "@phosphor-icons/react";

import { Button } from "@/components/ui/button";
import { apiFetch } from "@/lib/api-client";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";

const AUDIENCES = [
  { value: "all", label: "Every customer", hint: "Everyone signed up as a customer" },
  { value: "ordered", label: "Customers who have paid", hint: "Anyone with a paid order" },
  { value: "one", label: "One customer", hint: "By the email they signed up with" },
] as const;

type Audience = (typeof AUDIENCES)[number]["value"];

const field =
  "w-full rounded-[12px] border border-tm-border bg-card px-3 text-[14px] font-medium text-tm-ink outline-none placeholder:text-tm-text-3 focus:border-tm-coral/60";

/**
 * The communication center's compose form (119). The preview on the right is
 * the pop-up exactly as a customer will see it on their next visit.
 */
export function ComposeAnnouncement({ reach }: { reach: { all: number; ordered: number } }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<Audience>("all");
  const [email, setEmail] = useState("");
  const [linkHref, setLinkHref] = useState("");
  const [linkLabel, setLinkLabel] = useState("");
  const [expires, setExpires] = useState("");
  const [busy, setBusy] = useState(false);

  const linkOk = linkHref === "" || (linkHref.startsWith("/") && !linkHref.startsWith("//"));
  const ready = title.trim() && body.trim() && linkOk && (!linkHref || linkLabel.trim()) && (audience !== "one" || email.includes("@"));
  const reachText = audience === "all" ? `${reach.all} customers` : audience === "ordered" ? `${reach.ordered} customers` : "1 customer";

  const send = async () => {
    if (!window.confirm(`Send "${title.trim()}" to ${reachText}? It shows as a pop-up on their next visit.`)) return;
    setBusy(true);
    try {
      await apiFetch("/api/admin/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body,
          audience,
          email: audience === "one" ? email : undefined,
          link_href: linkHref || undefined,
          link_label: linkHref ? linkLabel : undefined,
          expires_in_days: expires ? Number(expires) : undefined,
        }),
      });
      toast.success({ title: "Message sent", description: `It shows to ${reachText} on their next visit.` });
      setTitle("");
      setBody("");
      setEmail("");
      setLinkHref("");
      setLinkLabel("");
      setExpires("");
      router.refresh();
    } catch (error) {
      toast.error({ title: "Couldn't send it", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <div className="flex min-w-0 flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-tm-ink">Title</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. New: pay with MTN MoMo in one tap" className={cn(field, "h-11")} />
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="text-[12.5px] font-semibold text-tm-ink">Message</span>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={1000} rows={5} placeholder="What changed, and what the customer can do about it." className={cn(field, "py-2.5 leading-[1.5]")} />
          <span className="text-[11.5px] font-medium text-tm-text-3">{body.length}/1000</span>
        </label>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1.5 text-[12.5px] font-semibold text-tm-ink">Who gets it</legend>
          <div className="grid grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-3">
            {AUDIENCES.map((a) => (
              <button
                key={a.value}
                type="button"
                onClick={() => setAudience(a.value)}
                aria-pressed={audience === a.value}
                className={cn(
                  "flex flex-col items-start gap-0.5 rounded-[14px] border px-3 py-2.5 text-left transition-colors",
                  audience === a.value ? "border-tm-coral/50 bg-tm-pill-bg" : "border-tm-border bg-card hover:bg-tm-paper",
                )}
              >
                <span className="text-[13px] font-semibold text-tm-ink">{a.label}</span>
                <span className="text-[11.5px] font-medium text-tm-text-3">
                  {a.value === "all" ? `${reach.all} today` : a.value === "ordered" ? `${reach.ordered} today` : a.hint}
                </span>
              </button>
            ))}
          </div>
          {audience === "one" ? (
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="customer@example.com" className={cn(field, "h-10")} aria-label="Customer's email" />
          ) : null}
        </fieldset>

        <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-tm-ink">Link (optional)</span>
            <input value={linkHref} onChange={(e) => setLinkHref(e.target.value.trim())} placeholder="/app/bag" className={cn(field, "h-10 font-mono text-[13px]")} aria-invalid={!linkOk || undefined} />
            {!linkOk ? <span className="text-[11.5px] font-medium text-tm-amber">A page on Tomame, starting with /</span> : null}
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[12.5px] font-semibold text-tm-ink">Button text</span>
            <input value={linkLabel} onChange={(e) => setLinkLabel(e.target.value)} maxLength={40} placeholder="Open my bag" disabled={!linkHref} className={cn(field, "h-10 disabled:bg-tm-paper")} />
          </label>
        </div>
        <label className="flex w-full flex-col gap-1.5 sm:w-56">
          <span className="text-[12.5px] font-semibold text-tm-ink">Stop showing after</span>
          <select value={expires} onChange={(e) => setExpires(e.target.value)} className={cn(field, "h-10")}>
            <option value="">30 days (default)</option>
            <option value="1">1 day</option>
            <option value="3">3 days</option>
            <option value="7">7 days</option>
            <option value="14">14 days</option>
          </select>
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Button className="rounded-full" disabled={!ready || busy} onClick={send}>
            {busy ? "Sending…" : `Send to ${reachText}`}
          </Button>
          <span className="text-[12px] font-medium text-tm-text-3">In-app only: a pop-up on their next visit, then in their bell. Not emailed.</span>
        </div>
      </div>

      {/* The pop-up as the customer will see it. */}
      <div className="flex flex-col gap-2">
        <span className="text-[12px] font-semibold text-tm-text-2">What the customer sees</span>
        <div className="flex flex-col gap-3 rounded-[20px] border border-tm-border bg-card p-5 shadow-[0_18px_40px_-28px_rgba(43,36,34,0.45)]">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-tm-pill-bg px-2.5 py-1 text-[11.5px] font-bold text-tm-coral-strong">
            <Megaphone weight="fill" className="size-3.5" aria-hidden />
            From Tomame
          </span>
          <p className="font-display text-[19px] leading-tight font-bold break-words text-tm-ink">{title.trim() || "Your title"}</p>
          <p className="text-[14px] leading-[1.55] font-medium break-words whitespace-pre-line text-tm-text-2">{body.trim() || "Your message."}</p>
          <div className="flex justify-end gap-2 pt-1">
            {linkHref ? <span className="rounded-full px-3 py-2 text-[13px] font-semibold text-tm-text-2">Got it</span> : null}
            <span className="rounded-full bg-tm-coral px-4 py-2 text-[13px] font-semibold text-white">{linkHref ? linkLabel.trim() || "Open" : "Got it"}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
