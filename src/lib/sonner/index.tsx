"use client";

import React from "react";
import { toast as sonnerToast } from "sonner";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";

type ToastVariant =
  | "default"
  | "success"
  | "error"
  | "info"
  | "warning"
  | "loading";

interface ToastProps {
  id: string | number;
  title: string;
  description?: string;
  variant?: ToastVariant;
  button?: {
    label: string;
    onClick: () => void;
  };
}

const variantConfig: Record<ToastVariant, { icon: React.ReactNode }> = {
  default: { icon: null },
  success: {
    icon: <CheckCircle2 className="size-5 shrink-0 text-tm-green" />,
  },
  error: {
    icon: <XCircle className="size-5 shrink-0 text-destructive" />,
  },
  info: {
    icon: <Info className="size-5 shrink-0 text-tm-coral" />,
  },
  warning: {
    icon: <AlertTriangle className="size-5 shrink-0 text-tm-amber" />,
  },
  loading: {
    icon: <Spinner className="size-5 shrink-0 text-muted-foreground" />,
  },
};

function Toast({
  id,
  title,
  description,
  variant = "default",
  button,
}: ToastProps) {
  const { icon } = variantConfig[variant];

  return (
    <div
      className={cn(
        "flex w-full items-start rounded-[16px] border border-border bg-card p-4 shadow-[0_16px_40px_-16px_rgba(43,36,34,0.3)] md:w-100 md:max-w-100",
      )}
    >
      {icon && <div className="mr-3 pt-0.5">{icon}</div>}
      <div className="flex flex-1 flex-col">
        <p className="text-sm font-semibold text-foreground">{title}</p>
        {description && (
          <p className="mt-1 text-[13px] leading-[1.45] text-muted-foreground">{description}</p>
        )}
      </div>
      {button && (
        <div className="ml-4 shrink-0">
          <button
            className="min-h-9 rounded-[10px] bg-muted px-3 text-sm font-semibold text-foreground hover:bg-tm-tint dark:hover:bg-muted/70"
            onClick={() => {
              button.onClick();
              sonnerToast.dismiss(id);
            }}
          >
            {button.label}
          </button>
        </div>
      )}
    </div>
  );
}

type ToastOptions = Omit<ToastProps, "id" | "variant">;

function showToast(options: ToastOptions & { variant?: ToastVariant }) {
  return sonnerToast.custom((id) => <Toast id={id} {...options} />);
}

const toast = Object.assign((options: ToastOptions) => showToast(options), {
  success: (options: ToastOptions) =>
    showToast({ ...options, variant: "success" }),
  error: (options: ToastOptions) => showToast({ ...options, variant: "error" }),
  info: (options: ToastOptions) => showToast({ ...options, variant: "info" }),
  warning: (options: ToastOptions) =>
    showToast({ ...options, variant: "warning" }),
  loading: (options: ToastOptions) =>
    showToast({ ...options, variant: "loading" }),
});

export { toast, Toast };
