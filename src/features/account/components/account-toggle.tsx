"use client";

import { cn } from "@/lib/utils";

/**
 * A labelled on/off switch for a notification channel.
 *
 * Hand-rolled rather than pulled from a library because `src/components/ui` has
 * no switch and one preference toggle does not justify a new dependency. It is
 * a real `role="switch"` button with `aria-checked`, so a screen reader
 * announces its state instead of reading a coloured rectangle.
 *
 * `disabled` carries a reason. A toggle that refuses to move and says nothing
 * reads as a bug; the reason is rendered under the label and wired to the
 * control through `aria-describedby`.
 */
export function AccountToggle({
  id,
  label,
  description,
  checked,
  disabled,
  disabledReason,
  onChange,
}: {
  id: string;
  label: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  disabledReason?: React.ReactNode;
  onChange: (next: boolean) => void;
}) {
  const describedBy = `${id}-description`;

  return (
    <div className="flex items-start justify-between gap-4 border-b border-tm-hairline py-3.5 last:border-b-0">
      <div className="flex flex-col gap-1">
        <span className="text-sm leading-none font-semibold">{label}</span>
        <span id={describedBy} className="max-w-[46ch] text-xs leading-[1.5] font-medium text-tm-text-2">
          {description}
        </span>
        {disabled && disabledReason ? (
          <span className="text-xs leading-[1.45] font-medium text-tm-amber">{disabledReason}</span>
        ) : null}
      </div>

      <button
        type="button"
        id={id}
        role="switch"
        aria-checked={checked}
        aria-label={label}
        aria-describedby={describedBy}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={cn(
          "relative mt-0.5 h-[26px] w-[46px] shrink-0 rounded-full transition-colors",
          "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-tm-coral",
          "disabled:cursor-not-allowed disabled:opacity-50",
          checked ? "bg-tm-coral" : "bg-tm-border",
        )}
      >
        <span
          aria-hidden
          className={cn(
            "absolute top-[3px] size-5 rounded-full bg-white shadow-sm transition-[left] duration-200 ease-[cubic-bezier(.16,1,.3,1)]",
            checked ? "left-[23px]" : "left-[3px]",
          )}
        />
      </button>
    </div>
  );
}
