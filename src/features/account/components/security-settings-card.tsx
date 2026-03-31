"use client";

import { useState } from "react";
import { Lock, Eye, EyeOff } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { apiFetch } from "@/lib/auth/api-helpers";

const changePasswordSchema = z
  .object({
    current_password: z.string().min(6, "Password must be at least 6 characters"),
    new_password: z.string().min(6, "Password must be at least 6 characters"),
    confirm_password: z.string(),
  })
  .refine((data) => data.new_password === data.confirm_password, {
    message: "Passwords don't match",
    path: ["confirm_password"],
  })
  .refine(
    (data) => data.current_password !== data.new_password,
    {
      message: "New password must be different from current password",
      path: ["new_password"],
    }
  );

type ChangePasswordFormData = z.infer<typeof changePasswordSchema>;

export function SecuritySettingsCard() {
  const [isOpen, setIsOpen] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const {
    control,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<ChangePasswordFormData>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: {
      current_password: "",
      new_password: "",
      confirm_password: "",
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async (data: ChangePasswordFormData) => {
      return apiFetch("/api/auth/change-password", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          current_password: data.current_password,
          new_password: data.new_password,
        }),
      });
    },
    onSuccess: () => {
      toast.success("Password changed successfully");
      reset();
      setIsOpen(false);
    },
    onError: (error) => {
      toast.error(error.message || "Failed to change password");
    },
  });

  const onSubmit = (data: ChangePasswordFormData) => {
    changePasswordMutation.mutate(data);
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Security Settings
          </CardTitle>
          <CardDescription>Manage your password and security preferences</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-medium text-stone-900">Password</p>
              <p className="text-sm text-stone-600 mt-1">
                Last changed 3 months ago
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => setIsOpen(true)}
              className="w-full sm:w-auto"
            >
              Change Password
            </Button>
          </div>

          <div className="border-t pt-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-stone-900">Two-Factor Authentication</p>
                <p className="text-sm text-stone-600 mt-1">
                  Disabled - Protect your account with 2FA
                </p>
              </div>
              <Button
                variant="outline"
                disabled
                className="w-full sm:w-auto opacity-50"
              >
                Enable 2FA
              </Button>
            </div>
          </div>

          <div className="border-t pt-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="font-medium text-stone-900">Active Sessions</p>
                <p className="text-sm text-stone-600 mt-1">
                  1 active session on this device
                </p>
              </div>
              <Button variant="outline" disabled className="w-full sm:w-auto opacity-50">
                View All Sessions
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Change Password Dialog */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Enter your current password and choose a new password
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {/* Current Password */}
            <Field>
              <FieldLabel htmlFor="current_password">Current Password</FieldLabel>
              <div className="relative">
                <Controller
                  name="current_password"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="current_password"
                      type={showCurrentPassword ? "text" : "password"}
                      placeholder="Enter your current password"
                      {...field}
                      disabled={changePasswordMutation.isPending}
                    />
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowCurrentPassword(!showCurrentPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700"
                >
                  {showCurrentPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.current_password && (
                <FieldError>{errors.current_password.message}</FieldError>
              )}
            </Field>

            {/* New Password */}
            <Field>
              <FieldLabel htmlFor="new_password">New Password</FieldLabel>
              <div className="relative">
                <Controller
                  name="new_password"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="new_password"
                      type={showNewPassword ? "text" : "password"}
                      placeholder="Enter your new password"
                      {...field}
                      disabled={changePasswordMutation.isPending}
                    />
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700"
                >
                  {showNewPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.new_password && (
                <FieldError>{errors.new_password.message}</FieldError>
              )}
            </Field>

            {/* Confirm Password */}
            <Field>
              <FieldLabel htmlFor="confirm_password">Confirm Password</FieldLabel>
              <div className="relative">
                <Controller
                  name="confirm_password"
                  control={control}
                  render={({ field }) => (
                    <Input
                      id="confirm_password"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="Confirm your new password"
                      {...field}
                      disabled={changePasswordMutation.isPending}
                    />
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-500 hover:text-stone-700"
                >
                  {showConfirmPassword ? (
                    <EyeOff className="h-4 w-4" />
                  ) : (
                    <Eye className="h-4 w-4" />
                  )}
                </button>
              </div>
              {errors.confirm_password && (
                <FieldError>{errors.confirm_password.message}</FieldError>
              )}
            </Field>

            <div className="flex justify-end gap-3 pt-4">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsOpen(false)}
                disabled={changePasswordMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                disabled={changePasswordMutation.isPending}
                className="gap-2"
              >
                {changePasswordMutation.isPending && (
                  <Loader2 className="h-4 w-4 animate-spin" />
                )}
                Update Password
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
