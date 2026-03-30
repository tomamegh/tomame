"use client";
import { zodResolver } from "@hookform/resolvers/zod";
import React from "react";
import { Controller, useForm } from "react-hook-form";
import { createUserSchema } from "../schema";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PlusIcon } from "lucide-react";
import { useCreateUser } from "../hooks/useUsers";
import { User } from "@supabase/supabase-js";
import {
  InputGroup,
  InputGroupButton,
  InputGroupInput,
} from "@/components/ui/input-group";
import { Spinner } from "@/components/ui/spinner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface FormProps {
  onSuccess?: (data: User) => void;
  onError?: (error: unknown) => void;
}

const AddUserForm = ({ ...props }: FormProps) => {
  const { mutate, isPending } = useCreateUser();
  const [open, setOpen] = React.useState(false);

  const form = useForm({
    resolver: zodResolver(createUserSchema),
  });

  const generateRandomPassword = () => {
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*";
    const length = 12;
    const array = new Uint32Array(length);
    crypto.getRandomValues(array);
    const password = Array.from(array, (n) => chars[n % chars.length]).join("");
    form.setValue("password", password, { shouldValidate: true });
  };

  const handleSubmit = () => {
    form.handleSubmit((data) =>
      mutate(data, {
        onSuccess(res) {
          if (props.onSuccess) {
            props.onSuccess(res.data);
          }
        },
      }),
    )();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <form id="admin-create-user-form" aria-disabled={isPending}>
        <DialogTrigger asChild>
          <Button size="sm" className="gap-1.5">
            <PlusIcon className="size-4" />
            Add User
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>
              Create a new user account. The account is immediately active with
              email confirmation bypassed.
            </DialogDescription>
          </DialogHeader>
          <FieldGroup className="my-5">
            <div className="grid md:grid-cols-2 gap-5">
              <Controller
                control={form.control}
                name="first_name"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>First Name</FieldLabel>
                    <Input
                      {...field}
                      id="admin-create-user-form-first-name"
                      aria-invalid={fieldState.invalid}
                      aria-disabled={isPending}
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="last_name"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid}>
                    <FieldLabel>Last Name</FieldLabel>
                    <Input
                      {...field}
                      id="admin-create-user-form-last-name"
                      aria-invalid={fieldState.invalid}
                      aria-disabled={isPending}
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
            <div className="grid md:grid-cols-3 gap-5">
              <Controller
                control={form.control}
                name="email"
                render={({ field, fieldState }) => (
                  <Field data-invalid={fieldState.invalid} className="col-span-2">
                    <FieldLabel>Email</FieldLabel>
                    <Input
                      {...field}
                      id="admin-create-user-form-email"
                      aria-invalid={fieldState.invalid}
                      aria-disabled={isPending}
                      autoComplete="off"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
              <Controller
                control={form.control}
                name="role"
                render={({ field, fieldState, }) => (
                  <Field data-invalid={fieldState.invalid} className="col-span-1">
                    <FieldLabel>Role</FieldLabel>
                    <Select onValueChange={field.onChange} {...field} defaultValue="user">
                      <SelectTrigger className="w-full max-w-48">
                        <SelectValue placeholder="Select Role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectGroup>
                          <SelectItem value="user">User</SelectItem>
                          <SelectItem value="admin">Admin</SelectItem>
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                )}
              />
            </div>
            <Controller
              control={form.control}
              name="password"
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel>Password</FieldLabel>
                  <InputGroup>
                    <InputGroupInput
                      {...field}
                      id="admin-create-user-form-password"
                      aria-invalid={fieldState.invalid}
                      aria-disabled={isPending}
                      autoComplete="off"
                    />
                    <InputGroupButton
                      type="button"
                      onClick={generateRandomPassword}
                      variant={"secondary"}
                      className="mr-1"
                    >
                      Generate
                    </InputGroupButton>
                  </InputGroup>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button
                variant="outline"
                disabled={isPending}
                onClick={() => form.reset()}
              >
                Discard
              </Button>
            </DialogClose>
            <Button type="button" onClick={handleSubmit} disabled={isPending}>
              {isPending ? (
                <>
                  Saving <Spinner />
                </>
              ) : (
                "Save"
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </form>
    </Dialog>
  );
};

export default AddUserForm;
