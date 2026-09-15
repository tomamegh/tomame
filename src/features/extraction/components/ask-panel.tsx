"use client";

import { useCallback, useState } from "react";
import { ArrowRight, CheckCircle, ChatCircleDots, WhatsappLogo } from "@phosphor-icons/react/ssr";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useCreateAssistedRequest } from "@/features/assisted/hooks/useAssisted";
import { createAssistedRequestSchema, type CreateAssistedRequestInput } from "@/features/assisted/schema";
import type { AssistedRequest } from "@/features/assisted/types";
import { hostOf } from "@/features/bag/components/format";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useCreatePaste } from "../hooks/usePastes";
import type { PasteStatus } from "../services/paste-status";
import { describeAsk } from "./ask-format";
import { looksLikeUrl } from "./buy-for-me-mode";

/**
 * The field look, and it is the dialog's.
 *
 * `AssistedRequestDialog` carries the same constant for the same reason: `Input`
 * and `Textarea` are the shadcn defaults — 6px radius, a shadow, a
 * `text-base md:text-sm` scale — which read as a different product inside a
 * Tomame card. It is duplicated rather than exported because the two live in
 * different features and a shared "field" export is a design system decision
 * nobody has made yet; if a third copy appears, that is the moment.
 *
 * FOCUS IS DELIBERATELY QUIET. `--ring` in this theme is `--tm-coral`, so the
 * default treatment paints a solid coral border AND a coral ring, which reads as
 * a failed validation before anybody has typed. Only `aria-invalid` gets a hard
 * colour, and it is amber, which is what every other error in this app uses.
 */
const FIELD = cn(
  "rounded-[14px] border-tm-border bg-card px-3.5 py-3 text-base leading-[1.5] shadow-none sm:text-[15px]",
  "focus-visible:border-tm-border focus-visible:ring-2 focus-visible:ring-tm-coral/20",
  "aria-invalid:border-tm-amber aria-invalid:ring-2 aria-invalid:ring-tm-amber/20",
);

export interface AskPanelProps {
  /**
   * Links a buyer is already holding for this viewer, newest first.
   *
   * Derived from the paste list rather than fetched: every paste row already
   * carries its open assisted request (`PasteStatus.assisted`, joined by
   * `listOpenAssistedRequestsByUrl` on both the route and `GET /api/pastes`), so
   * this list re-reads itself for free whenever the mutation invalidates the
   * paste query. There is no `GET /api/assisted-requests` and this panel does
   * NOT add one.
   */
  requests: readonly PasteStatus[];
  /** One clock for the whole panel, so every "you asked 2 hours ago" agrees. */
  now: Date;
}

/**
 * "Ask us to buy it" — the concierge route, as a screen instead of a wreckage
 * dialog.
 *
 * This is the actual business. A person in the US opens the shop, checks the
 * thing is real and in stock, buys it on their own card and sends it to Accra.
 * Until now the only way a customer could find that out was to paste a link that
 * FAILED and then notice "Describe it instead" on the error — so the one route
 * that always works was the one nobody could reach on purpose.
 *
 * IT CREATES NOTHING NEW. The request goes through the existing pair of
 * endpoints, in the order the service prefers:
 *
 *   1. `POST /api/pastes` puts the link on the queue and hands back a row id.
 *   2. `POST /api/assisted-requests` names that row, and the service reads the
 *      URL off it server side rather than trusting the body — its own comment:
 *      "letting the browser name the URL would allow the description and the
 *      link to disagree, and the buyer would then shop for the wrong thing."
 *
 * Step 1 is what makes the request PERMANENT on this screen. An assisted request
 * hanging off a bare URL is written to the same table but nothing on any
 * customer screen can list it back — the only read is keyed by the viewer's
 * pasted links. Registering the link first means the ask appears in the list
 * below, in the bag, and on the Home receipt, using joins that already exist.
 * It also means the machine has a go while the buyer works: if the extractor
 * wins, the customer has a price sooner, and the buyer closes the queue entry.
 *
 * If step 1 fails — a rate limit, a URL the paste endpoint will not take — the
 * ask is NOT lost: step 2 runs with the bare `product_url` instead, which the
 * schema calls "the Buy-for-me screen's link-free path". It is recorded, a buyer
 * sees it, and only this screen's memory of it is poorer.
 *
 * WHAT IT DELIBERATELY DOES NOT DO. It does not ask for a budget: there is no
 * column for one on `assisted_requests` and inventing a field the buyer will
 * never see is worse than not asking. The placeholder invites the number into
 * the description instead, which is the field a buyer actually reads. And it
 * does not let the customer skip the link. `assisted_requests.product_url` is
 * NOT NULL and the schema wants a real URL, so "I want a navy hoodie, size M"
 * with nothing to point at cannot be recorded at all today.
 *
 * Public, like the rest of the quote flow. Nothing here is promised to an
 * account: the buyer answers on the number in the form, so a signed-out visitor
 * gets exactly what a signed-in one gets.
 */
export function AskPanel({ requests, now }: AskPanelProps) {
  const [productUrl, setProductUrl] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<AssistedRequest | null>(null);

  const createPaste = useCreatePaste();
  const createRequest = useCreateAssistedRequest();
  const busy = createPaste.isPending || createRequest.isPending;

  const send = useCallback(
    (body: CreateAssistedRequestInput) => {
      createRequest.mutate(body, {
        onSuccess: (request) => {
          setDone(request);
          setProductUrl("");
          setDescription("");
          setPhone("");
        },
        onError: (error) => {
          if (error instanceof ApiFetchError && error.status === 429) {
            toast.error({
              title: "One moment",
              description: "You have sent a few of these. Try again shortly.",
            });
            return;
          }
          toast.error({ title: "Could not send that", description: error.message });
        },
      });
    },
    [createRequest],
  );

  const onSubmit = useCallback(() => {
    const typed = productUrl.trim();
    // Checked before the schema so the message names the field's own job. Zod's
    // `z.url()` would answer "That does not look like a link" for an empty box,
    // which reads as a complaint about something the customer never typed.
    if (!typed) {
      setErrors({ product_url: "Paste the page you saw it on. A buyer has to start somewhere." });
      return;
    }
    if (!looksLikeUrl(typed)) {
      setErrors({ product_url: "That looks like a name rather than a link. Paste the page's address." });
      return;
    }

    const input = { product_url: withScheme(typed), description, phone };
    // Validated here as well as on the server so a typo is answered instantly
    // rather than after a round trip. The server's copy is the one that counts.
    const parsed = createAssistedRequestSchema.safeParse(input);
    if (!parsed.success) {
      const next: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0] ?? "form");
        next[key] ??= issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    createPaste.mutate(
      { product_url: input.product_url },
      {
        // The paste row is the request's home on every screen that already reads
        // assisted state, so name it when we have one.
        onSuccess: (paste) =>
          send({
            extraction_request_id: paste.id,
            description: parsed.data.description,
            phone: parsed.data.phone,
          }),
        // The queue would not take the link. The ask still stands — record it
        // against the bare URL rather than making the customer type it twice.
        onError: () => send(parsed.data),
      },
    );
  }, [createPaste, description, phone, productUrl, send]);

  return (
    <section
      aria-labelledby="ask-heading"
      className="tm-up flex flex-col gap-4 [animation-delay:0.1s] [animation-duration:0.5s]"
    >
      <div className="flex flex-col gap-5 rounded-[24px] border border-tm-border bg-card px-[18px] py-6 lg:px-[22px]">
        <header className="flex flex-col gap-2">
          <h2
            id="ask-heading"
            className="flex items-center gap-2 font-display text-[22px] leading-tight font-bold tracking-[-0.01em]"
          >
            <ChatCircleDots weight="fill" className="size-5 shrink-0 text-tm-coral" aria-hidden />
            Ask us to buy it
          </h2>
          <p className="text-sm leading-[1.5] text-tm-text-2">
            A person on our side opens the shop, checks the size, the colour and whether it is
            actually in stock, buys it on their own card in dollars and has it sent to our warehouse.
            You get one cedi price, landed in Accra, and you pay us, never the shop.
          </p>
        </header>

        {done ? (
          <Confirmation request={done} onAskAgain={() => setDone(null)} />
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              onSubmit();
            }}
            className="flex flex-col gap-4"
          >
            <Field
              htmlFor="ask-url"
              label="Where did you see it?"
              hint="The shop's page, a marketplace listing, anywhere. We read it automatically while a buyer picks it up, so you may get the price before they even reply."
              error={errors.product_url}
            >
              <Input
                id="ask-url"
                value={productUrl}
                onChange={(e) => setProductUrl(e.target.value)}
                placeholder="amazon.com/dp/…"
                inputMode="url"
                autoComplete="off"
                aria-invalid={!!errors.product_url}
                className={cn(FIELD, "h-14 sm:h-12")}
              />
            </Field>

            <Field
              htmlFor="ask-description"
              label="What exactly do you want?"
              hint="The variant, the size, the colour, and what you are willing to spend, if you have a number in mind."
              error={errors.description}
            >
              <Textarea
                id="ask-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={4}
                maxLength={2000}
                placeholder="e.g. the 40mm one in navy, UK size 9, and only if it ships from the US. Budget around GH₵1,200."
                aria-invalid={!!errors.description}
                className={FIELD}
              />
            </Field>

            <Field
              htmlFor="ask-phone"
              label="Where can we reach you on WhatsApp?"
              error={errors.phone}
            >
              <Input
                id="ask-phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="024 555 0192"
                inputMode="tel"
                autoComplete="tel"
                aria-invalid={!!errors.phone}
                className={cn(FIELD, "h-14 sm:h-12")}
              />
            </Field>

            <button
              type="submit"
              disabled={busy}
              aria-busy={busy}
              className={cn(
                "tm-cta-gradient flex h-[52px] items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold text-white",
                "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
              )}
            >
              {busy ? "Sending…" : "Have a buyer find it"}
              {!busy && <ArrowRight weight="bold" className="size-4" aria-hidden />}
            </button>
          </form>
        )}
      </div>

      {requests.length > 0 && <OpenRequests requests={requests} now={now} />}
    </section>
  );
}

/**
 * What the customer sees once it is logged. The WhatsApp link is offered rather
 * than only promised: someone who wants to talk now should not have to wait for
 * the queue to reach them. The href comes from `site_settings.whatsapp_number`
 * via the server and is never written here.
 */
function Confirmation({
  request,
  onAskAgain,
}: {
  request: AssistedRequest;
  onAskAgain: () => void;
}) {
  return (
    <div className="flex flex-col gap-3" role="status">
      <p className="flex items-center gap-2 text-[15px] leading-none font-bold text-tm-green">
        <CheckCircle weight="fill" className="size-5 shrink-0" aria-hidden />
        We have it
      </p>
      <p className="text-sm leading-[1.5] text-tm-text-2">
        A buyer will message you on the number you gave us. Nothing is charged until you have seen
        the whole cedi price.
      </p>
      <p className="rounded-xl bg-tm-tint px-3.5 py-3 text-[13px] leading-[1.5] text-tm-text-2">
        &ldquo;{request.description}&rdquo;
      </p>

      {request.whatsapp_href && (
        <a
          href={request.whatsapp_href}
          target="_blank"
          rel="noreferrer"
          className="flex h-[52px] items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card text-[15px] leading-none font-semibold transition-colors hover:bg-tm-tint"
        >
          <WhatsappLogo weight="fill" className="size-[18px] text-tm-green" aria-hidden />
          Start the chat now
        </a>
      )}

      <button
        type="button"
        onClick={onAskAgain}
        className="h-12 text-[14px] leading-none font-semibold text-tm-coral transition-colors hover:text-tm-coral-strong focus-visible:ring-2 focus-visible:ring-tm-coral focus-visible:ring-offset-2 focus-visible:outline-none"
      >
        Ask for something else
      </button>
    </div>
  );
}

/**
 * The asks a buyer is already holding.
 *
 * Only settled links appear here. One that is still being read is already on
 * screen above in "Reading now", where its row says "A buyer is on it" — listing
 * it twice on the same screen would read as two requests.
 */
function OpenRequests({ requests, now }: { requests: readonly PasteStatus[]; now: Date }) {
  return (
    <section
      aria-label="With our buyers"
      className="overflow-hidden rounded-[20px] border border-tm-border bg-card"
    >
      <header className="flex items-center justify-between gap-3 px-[18px] py-3.5 lg:px-[22px]">
        <h3 className="text-[12px] leading-none font-bold tracking-[0.06em] text-tm-text-3 uppercase">
          With our buyers
        </h3>
        <span className="tm-nums shrink-0 text-[12px] leading-none font-semibold text-tm-text-3">
          {requests.length}
        </span>
      </header>
      <ul>
        {requests.map((paste) => (
          <OpenRequestRow key={paste.id} paste={paste} now={now} />
        ))}
      </ul>
    </section>
  );
}

function OpenRequestRow({ paste, now }: { paste: PasteStatus; now: Date }) {
  // Guarded by the caller's filter; narrowed here so this row can never be
  // rendered for a link nobody is holding.
  if (!paste.assisted) return null;
  const summary = describeAsk(paste.assisted, now);

  return (
    <li className="flex flex-col gap-1.5 border-t border-tm-hairline px-[18px] py-4 lg:px-[22px]">
      <a
        href={paste.product_url}
        target="_blank"
        rel="noreferrer"
        className="truncate text-[15px] leading-[1.3] font-semibold text-tm-ink hover:underline"
        title={paste.product_url}
      >
        {hostOf(paste.product_url)}
      </a>
      <span
        className={cn(
          "flex items-center gap-1.5 text-[13px] leading-none font-medium",
          summary.tone === "green" ? "text-tm-green" : "text-tm-amber",
        )}
      >
        <CheckCircle weight="fill" className="size-3.5 shrink-0" aria-hidden />
        {summary.title}
      </span>
      {summary.detail && (
        <span className="text-xs leading-[1.45] text-tm-text-3">{summary.detail}</span>
      )}
    </li>
  );
}

function Field({
  htmlFor,
  label,
  hint,
  error,
  children,
}: {
  htmlFor: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={htmlFor} className="text-[13px] leading-none font-semibold">
        {label}
      </Label>
      {hint && (
        <p id={hintId} className="text-xs leading-[1.45] text-tm-text-3">
          {hint}
        </p>
      )}
      {children}
      {error && <p className="text-xs leading-[1.4] font-medium text-tm-amber">{error}</p>}
    </div>
  );
}

/**
 * `amazon.com/dp/…` as `https://amazon.com/dp/…`.
 *
 * `looksLikeUrl` is deliberately permissive about the scheme because that is how
 * people paste, but `assisted_requests` is handed a `z.url()` and the paste
 * endpoint parses a real URL. The scheme is added once, here, so both calls get
 * the same string and the buyer's queue never shows a link that will not open.
 */
function withScheme(raw: string): string {
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}
