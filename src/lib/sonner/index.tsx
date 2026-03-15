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
    icon: <CheckCircle2 className="size-5 shrink-0 text-emerald-500" />,
  },
  error: {
    icon: <XCircle className="size-5 shrink-0 text-red-500" />,
  },
  info: {
    icon: <Info className="size-5 shrink-0 text-blue-500" />,
  },
  warning: {
    icon: <AlertTriangle className="size-5 shrink-0 text-amber-500" />,
  },
  loading: {
    icon: <Spinner className="size-5 shrink-0 text-gray-400" />,
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
        "flex w-full items-start rounded-lg bg-white p-4 shadow-lg ring-1 ring-black/5 md:w-100 md:max-w-100",
      )}
    >
      {icon && <div className="mr-3 pt-0.5">{icon}</div>}
      <div className="flex flex-1 flex-col">
        <p className="text-sm font-medium text-gray-900">{title}</p>
        {description && (
          <p className="mt-1 text-sm text-gray-500">{description}</p>
        )}
      </div>
      {button && (
        <div className="ml-4 shrink-0">
          <button
            className="rounded bg-indigo-50 px-3 py-1 text-sm font-semibold text-indigo-600 hover:bg-indigo-100"
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
