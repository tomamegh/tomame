function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const env = {
  supabase: {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_DEFAULT_KEY"),
    serviceRoleKey: required("SUPABASE_SECRET_KEY"),
  },
  paystack: {
    secretKey: required("PAYSTACK_SECRET_KEY"),
    publicKey: required("NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY"),
  },
  apify: {
    apiToken: required("APIFY_API_TOKEN"),
  },
  app: {
    url: required("NEXT_PUBLIC_APP_URL"),
  },
} as const;
