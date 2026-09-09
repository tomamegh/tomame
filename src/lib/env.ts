function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

/** Returns null when unset or blank. Use for tiers the app degrades without. */
function optional(key: string): string | null {
  const value = process.env[key];
  return value && value.trim() ? value : null;
}

export const env = {
  supabase: {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    serviceRoleKey: required("SUPABASE_SECRET_KEY"),
  },
  paystack: {
    secretKey: required("PAYSTACK_SECRET_KEY"),
    publicKey: required("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY"),
  },
  app: {
    url: required("NEXT_PUBLIC_APP_URL"),
  },
  /** Extraction tiers. Each is skipped (not fatal) when its key is absent. */
  extraction: {
    browserlessApiKey: optional("BROWSERLESS_API_KEY"),
    /** Amazon structured product data (Rainforest API). Fast path; browser tiers remain the fallback. */
    rainforestApiKey: optional("RAINFOREST_API_KEY"),
    anthropicApiKey: optional("ANTHROPIC_API_KEY"),
    apifyApiToken: optional("APIFY_API_TOKEN"),
  },
} as const;
