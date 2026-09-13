"use client";

import { useCallback, useState } from "react";
import { ArrowRight, CheckCircle, WhatsappLogo } from "@phosphor-icons/react/ssr";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ApiFetchError } from "@/lib/auth/api-helpers";
import { toast } from "@/lib/sonner";
import { cn } from "@/lib/utils";
import { useCreateAssistedRequest } from "../hooks/useAssisted";
import { createAssistedRequestSchema } from "../schema";
import type { AssistedRequest } from "../types";

/**
 * The v2 field look. `Input` and `Textarea` are the shadcn defaults — 6px radius,
 * a shadow, and a `text-base md:text-sm` scale — which read as a different
 * product sitting inside a 24px-radius Tomame dialog.
 */
const FIELD = cn(
  "rounded-[14px] border-tm-border bg-card px-3.5 py-3 text-[15px] leading-[1.5] shadow-none",
  "focus-visible:border-tm-coral focus-visible:ring-2 focus-visible:ring-tm-coral/25",
  "aria-invalid:border-tm-amber aria-invalid:ring-0",
);

export interface AssistedRequestDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The paste being asked about. The server reads the URL off this row, not off the form. */
  extractionRequestId?: string | null;
  /** Only for the link-free path, where there is no paste to point at. */
  productUrl?: string | null;
  /** Shown read-only so the customer can see which link they are describing. */
  displayUrl: string;
}

/**
 * "We could not read that page — tell us what you want."
 *
 * The 20-second escape hatch. Extraction has either given up or is taking so long
 * that waiting is no longer reasonable, and the answer is a person: the customer
 * describes the item in their own words and a buyer picks it up on WhatsApp
 * (approved 2026-09-13 over a phone call).
 *
 * Two states in one dialog. Before submitting it is a form; afterwards it is the
 * confirmation, with a `wa.me` link so the customer can open the conversation
 * themselves rather than wait to be contacted. That link comes from
 * `site_settings.whatsapp_number` via the server — never written here.
 */
export function AssistedRequestDialog({
  open,
  onOpenChange,
  extractionRequestId,
  productUrl,
  displayUrl,
}: AssistedRequestDialogProps) {
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [done, setDone] = useState<AssistedRequest | null>(null);
  const create = useCreateAssistedRequest();

  const close = useCallback(
    (next: boolean) => {
      onOpenChange(next);
      // Reset only on the way out, and only once the dialog is actually closed,
      // so the confirmation does not flash back to an empty form as it animates.
      if (!next) {
        setTimeout(() => {
          setDescription("");
          setPhone("");
          setErrors({});
          setDone(null);
        }, 200);
      }
    },
    [onOpenChange],
  );

  const onSubmit = useCallback(() => {
    const input = {
      ...(extractionRequestId ? { extraction_request_id: extractionRequestId } : {}),
      ...(!extractionRequestId && productUrl ? { product_url: productUrl } : {}),
      description,
      phone,
    };

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
    create.mutate(parsed.data, {
      onSuccess: (result) => setDone(result),
      onError: (error) => {
        if (error instanceof ApiFetchError && error.status === 429) {
          toast.error({ title: "One moment", description: "You have sent a few of these — try again shortly." });
          return;
        }
        toast.error({ title: "Could not send that", description: error.message });
      },
    });
  }, [create, description, extractionRequestId, phone, productUrl]);

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="rounded-[24px] border-tm-border sm:max-w-[480px]">
        {done ? (
          <Confirmation request={done} onClose={() => close(false)} />
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="font-display text-xl leading-tight font-bold">
                Tell us what you want
              </DialogTitle>
              <DialogDescription className="text-[13px] leading-[1.5] text-tm-text-2">
                We could not read this page automatically. Describe it in your own words and a buyer
                will sort it out for you on WhatsApp.
              </DialogDescription>
            </DialogHeader>

            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1.5">
                <Label className="text-[13px] leading-none font-semibold">Link</Label>
                <p
                  className="truncate rounded-[14px] bg-tm-tint px-3.5 py-3 text-[13px] leading-[1.4] text-tm-text-2"
                  title={displayUrl}
                >
                  {displayUrl}
                </p>
              </div>

              <Field label="What is it you want?" error={errors.description}>
                <Textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  maxLength={2000}
                  placeholder="e.g. the 32GB RAM version, black, and only if it ships from the US"
                  aria-invalid={!!errors.description}
                  className={FIELD}
                />
              </Field>

              <Field label="Where can we reach you?" error={errors.phone}>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="024 555 0192"
                  inputMode="tel"
                  autoComplete="tel"
                  aria-invalid={!!errors.phone}
                  className={cn(FIELD, "h-12")}
                />
              </Field>

              <button
                type="button"
                onClick={onSubmit}
                disabled={create.isPending}
                aria-busy={create.isPending}
                className={cn(
                  "tm-cta-gradient flex h-12 items-center justify-center gap-2 rounded-[14px] text-[15px] leading-none font-bold text-white",
                  "transition-opacity disabled:cursor-not-allowed disabled:opacity-60",
                )}
              >
                {create.isPending ? "Sending…" : "Have a buyer contact me"}
                {!create.isPending && <ArrowRight weight="bold" className="size-4" aria-hidden />}
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * What the customer sees once it is logged. The WhatsApp link is offered rather
 * than promised-only: a customer who wants to talk now should not have to wait
 * for the queue to reach them.
 */
function Confirmation({ request, onClose }: { request: AssistedRequest; onClose: () => void }) {
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 font-display text-xl leading-tight font-bold">
          <CheckCircle weight="fill" className="size-5 shrink-0 text-tm-green" aria-hidden />
          A buyer is on it
        </DialogTitle>
        <DialogDescription className="text-[13px] leading-[1.5] text-tm-text-2">
          We have your request and the link. Someone will message you on the number you gave us.
        </DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-3">
        <p className="rounded-xl bg-tm-tint px-3.5 py-3 text-[13px] leading-[1.5] text-tm-text-2">
          &ldquo;{request.description}&rdquo;
        </p>

        {request.whatsapp_href && (
          <a
            href={request.whatsapp_href}
            target="_blank"
            rel="noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-tm-border bg-card text-[15px] leading-none font-semibold transition-colors hover:bg-tm-tint"
          >
            <WhatsappLogo weight="fill" className="size-[18px] text-tm-green" aria-hidden />
            Start the chat now
          </a>
        )}

        <button
          type="button"
          onClick={onClose}
          className="h-11 text-[14px] leading-none font-semibold text-tm-text-2 transition-colors hover:text-tm-ink"
        >
          Done
        </button>
      </div>
    </>
  );
}

function Field({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-[13px] leading-none font-semibold">{label}</Label>
      {children}
      {error && <p className="text-xs leading-[1.4] font-medium text-tm-amber">{error}</p>}
    </div>
  );
}
