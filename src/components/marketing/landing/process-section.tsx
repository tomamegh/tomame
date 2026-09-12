import { AirplaneTilt } from "@phosphor-icons/react/ssr";

import type { SiteContentRow } from "@/db/queries/site-content";

import { rowIcon } from "./icons";

/** The mock carries an explicit delay per card rather than a uniform stagger. */
const CARD_DELAYS = ["0.1s", "0.2s", "0.3s", "0.4s"] as const;

export interface ProcessSectionProps {
  /** `process_step` rows, in `sort_order`. */
  steps: readonly SiteContentRow[];
}

/**
 * "Four steps between a link and your front door."
 *
 * The heading counts the rows rather than hardcoding four, so adding a step in
 * the admin does not make the copy lie.
 */
export function ProcessSection({ steps }: ProcessSectionProps) {
  if (steps.length === 0) return null;

  const count =
    ["Zero", "One", "Two", "Three", "Four", "Five", "Six"][steps.length] ??
    String(steps.length);

  return (
    <section
      id="how-it-works"
      aria-labelledby="how-it-works-heading"
      className="scroll-mt-20 bg-card px-5 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-12">
        <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end md:gap-10">
          <div className="flex flex-col gap-3.5">
            <span className="text-[11px] font-semibold tracking-[0.14em] text-tm-coral uppercase">
              How it works
            </span>
            <h2
              id="how-it-works-heading"
              className="max-w-[560px] text-[clamp(2rem,5vw,46px)] leading-[1.02] font-bold"
            >
              {count} steps between a link and your front door.
            </h2>
          </div>
          <p className="max-w-[360px] text-base leading-[1.5] text-tm-text-2">
            Most people finish step one in under a minute. We handle the rest.
          </p>
        </div>

        <div className="relative">
          {/* The rail and its plane are pure decoration; hidden below lg where the cards stack. */}
          <div
            aria-hidden
            className="absolute top-[26px] right-[8%] left-[8%] hidden h-0.5 bg-tm-border lg:block"
          />
          <div
            aria-hidden
            className="absolute top-[18px] left-[8%] hidden h-0 w-[84%] lg:block"
          >
            <span className="tm-plane absolute -ml-2 text-tm-coral">
              <AirplaneTilt weight="fill" className="size-4" />
            </span>
          </div>

          <ol className="relative grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => {
              const StepIcon = rowIcon(step.data);
              const number =
                typeof step.data.n === "string"
                  ? step.data.n
                  : String(index + 1).padStart(2, "0");

              return (
                <li
                  key={step.id}
                  className="tm-up flex flex-col gap-4.5 [animation-duration:0.6s]"
                  style={{
                    animationDelay:
                      CARD_DELAYS[index] ?? `${0.1 * (index + 1)}s`,
                  }}
                >
                  <span className="flex size-13.5 items-center justify-center rounded-full border-2 border-tm-coral bg-card lg:ml-[calc(50%-27px)]">
                    <StepIcon
                      weight="duotone"
                      className="size-6 text-tm-coral"
                      aria-hidden
                    />
                  </span>
                  <div className="flex min-h-[200px] flex-col gap-2.5 rounded-[22px] border border-tm-border bg-tm-paper p-5.5">
                    <span className="text-xs font-bold tracking-[0.14em] text-tm-text-3">
                      STEP {number}
                    </span>
                    <h3 className="text-xl leading-[1.15] font-bold">
                      {step.title}
                    </h3>
                    <p className="text-sm leading-[1.5] text-tm-text-2">
                      {step.body}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </div>
    </section>
  );
}
