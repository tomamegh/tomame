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
  /** Transactional email. No fallback: a wrong key or sender domain fails every send silently. */
  email: {
    resendApiKey: required("RESEND_API_KEY"),
    /** e.g. `Tomame <no-reply@your-verified-domain>`; must be a domain verified in Resend. */
    fromAddress: required("RESEND_FROM_EMAIL"),
  },
  /** Bearer secret pg_cron sends to /api/cron/*. */
  cron: {
    secret: required("CRON_SECRET"),
  },
  /** Extraction tiers. Each is skipped (not fatal) when its key is absent. */
  extraction: {
    browserlessApiKey: optional("BROWSERLESS_API_KEY"),
    /** Amazon + eBay structured product data (ScraperAPI). The fast path; browser tiers remain the fallback. */
    scraperApiKey: optional("SCRAPERAPI_API_KEY"),
    /** Amazon structured product data (Rainforest API). Optional second source. */
    rainforestApiKey: optional("RAINFOREST_API_KEY"),
    anthropicApiKey: optional("ANTHROPIC_API_KEY"),
    apifyApiToken: optional("APIFY_API_TOKEN"),
    /** Oxylabs Web Scraper API (realtime, parsed e-commerce targets: Amazon, Walmart, …). */
    oxylabsUsername: optional("OXYLABS_USERNAME"),
    oxylabsPassword: optional("OXYLABS_PASSWORD"),
    /** Zyte API — AI product extraction on any store URL + browser HTML. */
    zyteApiKey: optional("ZYTE_API_KEY"),
  },
  /**
   * WhatsApp (Meta Cloud API). Every key optional: the channel is OFF until the
   * access token AND phone number id are both set, and then skipped cleanly
   * (no rows, no errors). Getters, so a test or a redeployed env var is read
   * at call time — see `whatsappConfig()` in lib/whatsapp/config.ts.
   */
  whatsapp: {
    get accessToken() { return optional("WHATSAPP_ACCESS_TOKEN"); },
    get phoneNumberId() { return optional("WHATSAPP_PHONE_NUMBER_ID"); },
    /** Graph API version, e.g. `v24.0`. */
    get apiVersion() { return optional("WHATSAPP_API_VERSION"); },
    /** App secret: signs webhook deliveries (X-Hub-Signature-256). */
    get appSecret() { return optional("WHATSAPP_APP_SECRET"); },
    /** The token typed into Meta's webhook setup; answers the GET handshake. */
    get verifyToken() { return optional("WHATSAPP_VERIFY_TOKEN"); },
    /** Override for a local mock of graph.facebook.com. Never set in production. */
    get apiBaseUrl() { return optional("WHATSAPP_API_BASE_URL"); },
  },
} as const;
