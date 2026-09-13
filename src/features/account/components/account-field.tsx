import { Label } from "@/components/ui/label";

/**
 * Label, control, optional hint, optional error — the account forms' one field
 * shape.
 *
 * The same arrangement `address-form-dialog.tsx` uses locally, lifted here so
 * the account panels do not re-invent it a third time. The error carries
 * `role="alert"` so a screen reader hears the validation message rather than
 * only seeing a red line appear.
 */
export function AccountField({
  id,
  label,
  hint,
  error,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id} className="text-[13px] leading-none font-semibold">
        {label}
      </Label>
      {children}
      {hint && !error ? (
        <p className="text-xs leading-[1.45] font-medium text-tm-text-3">{hint}</p>
      ) : null}
      {error ? (
        <p role="alert" className="text-xs leading-[1.4] font-medium text-tm-coral-strong">
          {error}
        </p>
      ) : null}
    </div>
  );
}
