"use client";

import React from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, Controller } from "react-hook-form";
import { motion, AnimatePresence } from "motion/react";
import { Send, CheckCircle2 } from "lucide-react";
import { contactSchema, type ContactFormData } from "../schema";
import { Input, Textarea } from "@/components/ui/form";
import { Field, FieldError, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Button } from "@/components/ui/button";

function ContactForm() {
  const [sent, setSent] = React.useState(false);
  const form = useForm<ContactFormData>({
    resolver: zodResolver(contactSchema),
  });

  const onSubmit = form.handleSubmit(() => {
    setSent(true);
  });

  return (
    <div className="rounded-3xl border border-stone-200 bg-white p-8 shadow-[0_4px_24px_-8px_rgba(120,113,108,0.1)] sm:p-10">
      <AnimatePresence mode="wait">
        {sent ? (
          <motion.div
            key="success"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="flex flex-col items-center justify-center py-12 text-center"
          >
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-emerald-50 ring-8 ring-emerald-50/50">
              <CheckCircle2 className="h-8 w-8 text-emerald-500" />
            </div>
            <h3 className="mt-5 text-xl font-bold text-stone-900">Message sent!</h3>
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-stone-500">
              Thanks for reaching out. We&apos;ll get back to you within a few hours.
            </p>
            <button
              onClick={() => { setSent(false); form.reset(); }}
              className="mt-6 text-sm font-semibold text-rose-500 hover:text-rose-600 transition-colors"
            >
              Send another message
            </button>
          </motion.div>
        ) : (
          <motion.div
            key="form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            <div className="mb-8">
              <h2 className="text-2xl font-bold tracking-tight text-stone-900">
                Send us a message
              </h2>
              <p className="mt-1.5 text-sm leading-relaxed text-stone-500">
                We respond within a few hours during business hours.
              </p>
            </div>

            <form onSubmit={onSubmit} className="space-y-5">
              <FieldGroup>
                {/* Name + Email row */}
                <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                  <Controller
                    name="name"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field>
                        <FieldLabel htmlFor="contact-name" className="text-sm font-medium text-stone-700">
                          Full Name
                        </FieldLabel>
                        <Input
                          {...field}
                          id="contact-name"
                          placeholder="Your name"
                          aria-invalid={fieldState.invalid}
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                  <Controller
                    name="email"
                    control={form.control}
                    render={({ field, fieldState }) => (
                      <Field>
                        <FieldLabel htmlFor="contact-email" className="text-sm font-medium text-stone-700">
                          Email
                        </FieldLabel>
                        <Input
                          {...field}
                          type="email"
                          id="contact-email"
                          autoCapitalize="off"
                          placeholder="you@example.com"
                        />
                        {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                      </Field>
                    )}
                  />
                </div>

                {/* Subject */}
                <Controller
                  name="subject"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="contact-subject" className="text-sm font-medium text-stone-700">
                        Subject
                      </FieldLabel>
                      <Input
                        {...field}
                        id="contact-subject"
                        placeholder="What is this about?"
                        aria-invalid={fieldState.invalid}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />

                {/* Message */}
                <Controller
                  name="message"
                  control={form.control}
                  render={({ field, fieldState }) => (
                    <Field>
                      <FieldLabel htmlFor="contact-message" className="text-sm font-medium text-stone-700">
                        Message
                      </FieldLabel>
                      <Textarea
                        {...field}
                        id="contact-message"
                        placeholder="Tell us more about your question or request..."
                        rows={5}
                      />
                      {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
                    </Field>
                  )}
                />
              </FieldGroup>

              <Button
                type="submit"
                variant="primary"
                size="lg"
                className="w-full"
                disabled={form.formState.isSubmitting}
              >
                <Send className="h-4 w-4" />
                {form.formState.isSubmitting ? "Sending…" : "Send Message"}
              </Button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ContactForm;
