import { logger } from "@/lib/logger";

const SERPAPI_BASE_URL = "https://serpapi.com/search.json";

function getApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    throw new Error("Missing required environment variable: SERPAPI_API_KEY");
  }
  return key;
}

export interface SerpApiSearchOptions {
  /** Search query */
  query: string;
  /** Google domain (default: google.com) */
  googleDomain?: string;
  /** Number of results (default: 5) */
  num?: number;
  /** Timeout in ms (default: 15000) */
  timeout?: number;
}

export interface SerpApiOrganicResult {
  title: string;
  link: string;
  snippet: string;
  position: number;
}

export interface SerpApiSearchResult {
  success: boolean;
  results: SerpApiOrganicResult[];
  error?: string;
}

/**
 * Perform a Google search via SerpAPI.
 * Returns organic results with titles, links, and snippets.
 */
export async function searchGoogle(
  options: SerpApiSearchOptions,
): Promise<SerpApiSearchResult> {
  const { query, googleDomain = "google.com", num = 5, timeout = 15000 } = options;

  const params = new URLSearchParams({
    api_key: getApiKey(),
    engine: "google",
    q: query,
    google_domain: googleDomain,
    num: String(num),
  });

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);

    const response = await fetch(`${SERPAPI_BASE_URL}?${params.toString()}`, {
      signal: controller.signal,
    });
    clearTimeout(timer);

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      logger.error("SerpAPI request failed", { status: response.status, body: text });
      return { success: false, results: [], error: `HTTP ${response.status}` };
    }

    const data = await response.json();
    const organicResults: SerpApiOrganicResult[] = (data.organic_results ?? []).map(
      (r: Record<string, unknown>) => ({
        title: String(r.title ?? ""),
        link: String(r.link ?? ""),
        snippet: String(r.snippet ?? ""),
        position: Number(r.position ?? 0),
      }),
    );

    return { success: true, results: organicResults };
  } catch (err) {
    const message = err instanceof Error ? err.message : "SerpAPI search failed";
    logger.error("SerpAPI search error", { query, error: message });
    return { success: false, results: [], error: message };
  }
}
