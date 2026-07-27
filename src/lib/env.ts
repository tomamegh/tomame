function required(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

function optional(key: string, fallback: string): string {
  return process.env[key] || fallback;
}

export const env = {
  supabase: {
    url: required("NEXT_PUBLIC_SUPABASE_URL"),
    anonKey: required("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"),
    serviceRoleKey: required("SUPABASE_SECRET_KEY"),
  },
  hubtel: {
    /** Basic-auth username — the API "Client ID" from the Hubtel merchant portal. */
    apiId: required("HUBTEL_API_ID"),
    /** Basic-auth password — the API "Client Secret". Server-only, never expose. */
    apiKey: required("HUBTEL_API_KEY"),
    /** Merchant Account Number / POS Sales ID that receives the funds. */
    merchantAccountNumber: required("HUBTEL_MERCHANT_ACCOUNT_NUMBER"),
    /**
     * Unguessable secret embedded in the callback URL path. Hubtel does not sign
     * its callbacks, so this is what stops anyone from POSTing to our webhook.
     * It is a filter, not proof — the callback body is never trusted either
     * (see verifyAndSettlePayment).
     */
    callbackSecret: required("HUBTEL_CALLBACK_SECRET"),
    /** Receive-Money-Prompt host. Override if Hubtel moves the endpoint. */
    rmpBaseUrl: optional("HUBTEL_RMP_BASE_URL", "https://rmp.hubtel.com"),
    /** Transaction Status Check host. */
    statusBaseUrl: optional(
      "HUBTEL_STATUS_BASE_URL",
      "https://api-txnstatus.hubtel.com",
    ),
  },
  apify: {
    apiToken: required("APIFY_API_TOKEN"),
  },
  app: {
    url: required("NEXT_PUBLIC_APP_URL"),
  },
} as const;
