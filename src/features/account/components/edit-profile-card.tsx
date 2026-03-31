"use client";

import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { PROFILE_QUERY_KEY } from "@/features/account/hooks/useProfile";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Field, FieldError, FieldLabel } from "@/components/ui/field";
import { PlatformUser } from "@/features/users/types";
import { apiFetch } from "@/lib/auth/api-helpers";

const updateProfileSchema = z.object({
  first_name: z.string().max(255, "First name must be 255 characters or less").optional(),
  last_name: z.string().max(255, "Last name must be 255 characters or less").optional(),
  bio: z.string().max(500, "Bio must be 500 characters or less").optional(),
});

type UpdateProfileFormData = z.infer<typeof updateProfileSchema>;

interface EditProfileCardProps {
  user: PlatformUser | null;
  onProfileUpdated?: () => void;
}

export function EditProfileCard({ user, onProfileUpdated }: EditProfileCardProps) {
  const queryClient = useQueryClient();
  const {
    control,
    handleSubmit,
    formState: { errors, isDirty },
    reset,
  } = useForm<UpdateProfileFormData>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: {
      first_name: user?.profile?.first_name || "",
      last_name: user?.profile?.last_name || "",
      bio: user?.profile?.bio || "",
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: async (data: UpdateProfileFormData) => {
      return apiFetch("/api/app/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [...PROFILE_QUERY_KEY] });
      toast.success("Profile updated successfully");
      onProfileUpdated?.();
      reset();
    },
    onError: (error) => {
      toast.error(error.message || "Failed to update profile");
    },
  });

  const onSubmit = (data: UpdateProfileFormData) => {
    updateProfileMutation.mutate(data);
  };

  if (!user) {
    return null;
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Edit Profile</CardTitle>
        <CardDescription>Update your personal information</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
          {/* First Name */}
          <Field>
            <FieldLabel htmlFor="first_name">First Name</FieldLabel>
            <Controller
              name="first_name"
              control={control}
              render={({ field }) => (
                <Input
                  id="first_name"
                  placeholder="Enter your first name"
                  {...field}
                  disabled={updateProfileMutation.isPending}
                />
              )}
            />
            {errors.first_name && (
              <FieldError>{errors.first_name.message}</FieldError>
            )}
          </Field>

          {/* Last Name */}
          <Field>
            <FieldLabel htmlFor="last_name">Last Name</FieldLabel>
            <Controller
              name="last_name"
              control={control}
              render={({ field }) => (
                <Input
                  id="last_name"
                  placeholder="Enter your last name"
                  {...field}
                  disabled={updateProfileMutation.isPending}
                />
              )}
            />
            {errors.last_name && (
              <FieldError>{errors.last_name.message}</FieldError>
            )}
          </Field>

          {/* Bio */}
          <Field>
            <FieldLabel htmlFor="bio">Bio</FieldLabel>
            <Controller
              name="bio"
              control={control}
              render={({ field }) => (
                <Textarea
                  id="bio"
                  placeholder="Tell us about yourself"
                  className="resize-none"
                  rows={4}
                  {...field}
                  disabled={updateProfileMutation.isPending}
                />
              )}
            />
            {errors.bio && <FieldError>{errors.bio.message}</FieldError>}
          </Field>

          {/* Submit Button */}
          <div className="flex justify-end gap-3 pt-4">
            <Button
              type="button"
              variant="outline"
              onClick={() => reset()}
              disabled={!isDirty || updateProfileMutation.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!isDirty || updateProfileMutation.isPending}
              className="gap-2"
            >
              {updateProfileMutation.isPending && (
                <Loader2 className="h-4 w-4 animate-spin" />
              )}
              Save Changes
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
