"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { contactSchema } from "../schema";
import { Card, CardContent } from "@/components/ui/card";
import { Input, Textarea } from "@/components/ui/form";
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Button } from "@/components/ui/button";

function ContactForm() {
  const [sent] = React.useState(false);
  const form = useForm({
    resolver: zodResolver(contactSchema),
  });
  return (
    <Card variant="elevated" className="">
      <CardContent className="py-8">
        <h2 className="text-2xl font-bold text-stone-800 mb-6">
          Send us a message
        </h2>
        {sent && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 rounded-2xl text-emerald-700">
            Thanks for reaching out! We&apos;ll get back to you soon.
          </div>
        )}
        <form id="contact-form" className="space-y-6">
          <FieldGroup>
            <Controller
              name="name"
              control={form.control}
              render={({ field, fieldState }) => {
                return (
                  <Field>
                    <FieldLabel
                      htmlFor="contact-name"
                      className="text-sm font-medium text-stone-700"
                    >
                      Full Name
                    </FieldLabel>
                    <Input
                      {...field}
                      id="contact-name"
                      placeholder="Your name"
                      aria-invalid={fieldState.invalid}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />
            <Controller
              name="email"
              control={form.control}
              render={({ field, fieldState }) => {
                return (
                  <Field>
                    <FieldLabel
                      htmlFor="contact-email"
                      className="text-sm font-medium text-stone-700"
                    >
                      Email
                    </FieldLabel>
                    <Input
                      {...field}
                      type="email"
                      id="contact-email"
                      autoCapitalize="off"
                      placeholder="you@example.com"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />
            <Controller
              name="subject"
              control={form.control}
              render={({ field, fieldState }) => {
                return (
                  <Field>
                    <FieldLabel
                      htmlFor="contact-form-subject"
                      className="text-sm font-medium text-stone-700"
                    >
                      Subject
                    </FieldLabel>
                    <Input
                      {...field}
                      type="email"
                      id="contact-form-subject"
                      autoCapitalize="off"
                      placeholder="What is this about?"
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />
            <Controller
              name="subject"
              control={form.control}
              render={({ field, fieldState }) => {
                return (
                  <Field>
                    <FieldLabel
                      htmlFor="contact-form-subject"
                      className="text-sm font-medium text-stone-700"
                    >
                      Subject
                    </FieldLabel>
                    <Textarea
                      {...field}
                      placeholder="Tell us more..."
                      rows={5}
                    />
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </Field>
                );
              }}
            />
          </FieldGroup>

          <Button variant="primary" size="lg" className="w-full">
            Send Message
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default ContactForm;
