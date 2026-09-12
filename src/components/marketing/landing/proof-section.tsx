import { Star } from "@phosphor-icons/react/ssr";

import type { SiteContentRow } from "@/db/queries/site-content";

/** The mock's per-card delays: not a uniform stagger, so they are literal. */
const STAT_DELAYS = ["0.1s", "0.18s", "0.26s", "0.34s", "0.42s"] as const;

const DEFAULT_RATING = 5;
const MAX_RATING = 5;

function readRating(data: Record<string, unknown>): number {
  const raw = data.rating;
  if (typeof raw !== "number" || !Number.isFinite(raw)) return DEFAULT_RATING;
  return Math.max(0, Math.min(MAX_RATING, Math.round(raw)));
}

function readText(data: Record<string, unknown>, key: string): string | null {
  const raw = data[key];
  return typeof raw === "string" && raw.trim() ? raw : null;
}

/** "Kwame Asante" → "KA", used when the row carries no explicit initials. */
function fallbackInitials(name: string | null): string {
  if (!name) return "·";
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

export interface ProofSectionProps {
  /** `stat` rows: `title` is the figure, `body` the label. */
  stats: readonly SiteContentRow[];
  /** `testimonial` rows: `title` is the person, `body` the quote. */
  testimonials: readonly SiteContentRow[];
}

export function ProofSection({ stats, testimonials }: ProofSectionProps) {
  if (stats.length === 0 && testimonials.length === 0) return null;

  return (
    <section
      aria-label="Proof"
      className="bg-tm-paper px-5 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto flex max-w-[1280px] flex-col gap-14">
        {stats.length > 0 && (
          <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
            {stats.map((stat, index) => (
              <div
                key={stat.id}
                className="tm-up flex flex-col-reverse gap-2 rounded-[22px] border border-tm-border bg-card p-5 [animation-duration:0.6s] md:p-6.5"
                style={{
                  animationDelay: STAT_DELAYS[index] ?? `${0.1 + index * 0.08}s`,
                }}
              >
                <dt className="text-sm leading-[1.3] font-medium text-tm-text-2">
                  {stat.body}
                </dt>
                <dd className="tm-nums w-fit bg-[image:var(--tm-gradient)] bg-clip-text font-display text-[clamp(2rem,6vw,48px)] leading-none font-bold tracking-[-0.03em] text-transparent">
                  {stat.title}
                </dd>
              </div>
            ))}
          </dl>
        )}

        {testimonials.length > 0 && (
          <ul className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
            {testimonials.map((person, index) => {
              const rating = readRating(person.data);
              const initials =
                readText(person.data, "initials") ??
                fallbackInitials(person.title);

              return (
                <li
                  key={person.id}
                  className="tm-stagger flex flex-col gap-4.5 rounded-3xl border border-tm-border bg-card p-6 md:p-7"
                  style={{ "--tm-i": index + 1 } as React.CSSProperties}
                >
                  <span
                    className="flex gap-0.5 text-tm-coral"
                    aria-label={`Rated ${rating} out of ${MAX_RATING}`}
                  >
                    {Array.from({ length: rating }, (_, star) => (
                      <Star
                        key={star}
                        weight="fill"
                        className="size-4"
                        aria-hidden
                      />
                    ))}
                  </span>
                  <blockquote className="text-base leading-[1.55]">
                    “{person.body}”
                  </blockquote>
                  <div className="mt-auto flex items-center gap-3 border-t border-tm-hairline pt-3.5">
                    <span
                      aria-hidden
                      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-[image:var(--tm-gradient-cta)] text-[13px] font-bold text-white"
                    >
                      {initials}
                    </span>
                    <div className="min-w-0">
                      <p className="text-sm leading-[1.2] font-semibold">
                        {person.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-[1.3] text-tm-text-3">
                        {readText(person.data, "role")}
                      </p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
