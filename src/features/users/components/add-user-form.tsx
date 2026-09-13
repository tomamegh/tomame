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
import { useRouter } from "next/navigation";
import { toast } from "@/lib/sonner";
import { Select, SelectContent, SelectGroup, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { roleGrantSummary } from "./admin-user-format";

interface FormProps {
  onSuccess?: (data: User) => void;
  onError?: (error: unknown) => void;
}

const AddUserForm = ({ ...props }: FormProps) => {
  const router = useRouter();
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
          toast.success({
            title: "Account created",
            description:
              data.role === "admin"
                ? `${data.email} can now reach every admin screen and endpoint.`
                : `${data.email} can sign in to the storefront.`,
          });
          form.reset();
          setOpen(false);
          // The users list is a server component; without this it keeps
          // rendering the page that was built before this account existed.
          router.refresh();
          props.onSuccess?.(res.data);
        },
        onError(error) {
          toast.error({
            title: "Could not create the account",
            description: error instanceof Error ? error.message : "Please try again.",
          });
          props.onError?.(error);
        },
      }),
    )();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <form id="admin-create-user-form" aria-disabled={isPending}>
        <DialogTrigger asChild>
          <button
            type="button"
            className="tm-cta-gradient inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-4 text-[13px] font-semibold text-white transition-opacity hover:opacity-90"
          >
            <PlusIcon className="size-4" aria-hidden />
            Add a user
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create an account</DialogTitle>
            <DialogDescription>
              The account is active immediately and its email is treated as
              confirmed — nobody has to click a link. Send the password to the
              person yourself; this screen is the only place it is ever shown.
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
            {/*
              A promotion made at creation time is still a promotion, and it is
              the one that gets least scrutiny — an admin filling in four fields
              is not thinking about the blast radius of the fifth. The grant is
              spelled out where the choice is made, in the same words the role
              control on a user's page uses.
            */}
            {form.watch("role") === "admin" && (
              <p className="rounded-[12px] bg-tm-amber-bg px-3.5 py-2.5 text-[12px] leading-[1.5] font-medium text-[#7a4a06]">
                {roleGrantSummary("admin")}
              </p>
            )}
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
