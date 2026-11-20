"use client";

import { useState } from "react";

import { FinderExperience } from "@/features/finder/components/finder-experience";
import { PREVIEW_CUSTOMER_EMAIL, type FinderScenarioKey } from "@/features/finder/fixtures";
import type { FinderState } from "@/features/finder/types";
import { cn } from "@/lib/utils";

import { useScriptedRun } from "../_lib/use-scripted-run";
import { EmailPreview } from "./email-preview";
import { PreviewControls, type PreviewFrame, type PreviewTheme } from "./preview-controls";

/** The number on the brief's handoff link, wa.me/233594424746. Live, it comes from site settings. */
const BUYER_WHATSAPP = "0594424746";

interface FinderPreviewProps {
  email: { subject: string; html: string };
}

function scenarioFor(state: FinderState, view: "experience" | "email"): FinderScenarioKey | null {
  if (view === "email") return "email";
  switch (state.phase) {
    case "asking":
      return "asking";
    case "working":
      return "working";
    case "nothing_found":
      return "nothing_found";
    case "result":
      return state.candidates.some((c) => c.status === "confirming" || c.stockCheck) ? "confirming" : "result";
  }
}

export function FinderPreview({ email }: FinderPreviewProps) {
  const player = useScriptedRun();
  const [frame, setFrame] = useState<PreviewFrame>("mobile");
  const [theme, setTheme] = useState<PreviewTheme>("light");
  const [whatsappOptIn, setWhatsappOptIn] = useState(false);

  return (
    <>
      <div className={cn(theme === "dark" && "dark")}>
        <div
          className={cn(
            "mx-auto overflow-hidden border border-border bg-background text-foreground transition-[max-width] duration-200",
            frame === "mobile"
              ? "min-h-[780px] w-full max-w-[390px] rounded-[36px] shadow-[0_30px_60px_-30px_rgba(43,36,34,0.45)]"
              : "min-h-[720px] w-full max-w-[1180px] rounded-3xl shadow-[0_30px_60px_-36px_rgba(43,36,34,0.35)]",
          )}
        >
          {player.view === "email" ? (
            <EmailPreview
              subject={email.subject}
              html={email.html}
              to={PREVIEW_CUSTOMER_EMAIL}
              width={frame}
              theme={theme}
            />
          ) : (
            <FinderExperience
              state={player.state}
              elapsedMs={player.elapsedMs}
              customerEmail={PREVIEW_CUSTOMER_EMAIL}
              whatsappOptIn={whatsappOptIn}
              onWhatsappOptInChange={setWhatsappOptIn}
              onSubmit={(request) => player.start(request.query)}
              onReset={player.reset}
              onAddToBag={() => new Promise<void>((resolve) => window.setTimeout(resolve, 450))}
              buyerWhatsappNumber={BUYER_WHATSAPP}
            />
          )}
        </div>
      </div>
      <PreviewControls
        player={player}
        current={scenarioFor(player.state, player.view)}
        frame={frame}
        onFrameChange={setFrame}
        theme={theme}
        onThemeChange={setTheme}
      />
    </>
  );
}
