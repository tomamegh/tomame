import { logger } from "@/lib/logger";
import { parseWeight } from "@/features/pricing/services/weight-parser";

const SERPAPI_URL = "https://serpapi.com/search.json";

function getApiKey(): string {
  const key = process.env.SERPAPI_API_KEY;
  if (!key) {
    throw new Error("Missing required environment variable: SERPAPI_API_KEY");
  }
  return key;
}

interface SerpApiResult {
  title?: string;
  snippet?: string;
  link?: string;
}

interface SerpApiResponse {
  organic_results?: SerpApiResult[];
  answer_box?: {
    snippet?: string;
    answer?: string;
    contents?: { table?: string[][] };
  };
}

/**
 * Weight patterns to look for in search result snippets.
 * Ordered by specificity.
 */
const WEIGHT_PATTERNS = [
  /(?:weight|weighs)[:\s]+([0-9.]+\s*(?:lbs?|pounds?|kg|kilograms?|g|grams?|oz|ounces?))/i,
  /([0-9.]+\s*(?:lbs?|pounds?|kg|kilograms?|oz|ounces?))\s*(?:weight|shipping weight|item weight)/i,
  /(?:shipping weight|item weight|product weight|net weight)[:\s]*([0-9.]+\s*(?:lbs?|pounds?|kg|kilograms?|g|grams?|oz|ounces?))/i,
  /([0-9.]+\s*(?:lbs?|pounds?))/i,
  /([0-9.]+\s*(?:kg|kilograms?))/i,
  /([0-9.]+\s*(?:g|grams?))/i,
  /([0-9.]+\s*(?:oz|ounces?))/i,
];

/**
 * Search for product weight via SerpAPI Google Search.
 * Targets manufacturer pages, GSMArena, Apple.com, CNET, RTINGS.
 *
 * Returns weight in lbs if found, null otherwise.
 */
export async function lookupProductWeight(
  productName: string,
): Promise<{ weightLbs: number; source: string } | null> {
  let apiKey: string;
  try {
    apiKey = getApiKey();
  } catch {
    logger.warn("SerpAPI key not configured, skipping weight lookup");
    return null;
  }

  const query = `${productName} weight specs`;

  try {
    const params = new URLSearchParams({
      api_key: apiKey,
      q: query,
      engine: "google",
      num: "5",
    });

    const response = await fetch(`${SERPAPI_URL}?${params.toString()}`, {
      signal: AbortSignal.timeout(15000),
    });

    if (!response.ok) {
      logger.error("SerpAPI request failed", {
        status: response.status,
        productName,
      });
      return null;
    }

    const data: SerpApiResponse = await response.json();

    // Check answer box first (often contains direct specs)
    if (data.answer_box) {
      const answerText = [
        data.answer_box.answer,
        data.answer_box.snippet,
      ]
        .filter(Boolean)
        .join(" ");

      const weight = extractWeightFromText(answerText);
      if (weight) {
        logger.info("Weight found in SerpAPI answer box", {
          productName,
          weightLbs: weight,
        });
        return { weightLbs: weight, source: "serpapi_answer_box" };
      }
    }

    // Check organic results
    const results = data.organic_results ?? [];
    for (const result of results) {
      const text = [result.title, result.snippet].filter(Boolean).join(" ");
      const weight = extractWeightFromText(text);
      if (weight) {
        logger.info("Weight found in SerpAPI organic result", {
          productName,
          weightLbs: weight,
          resultTitle: result.title,
          resultLink: result.link,
        });
        return { weightLbs: weight, source: `serpapi:${result.link ?? "unknown"}` };
      }
    }

    logger.info("No weight found via SerpAPI", { productName });
    return null;
  } catch (err) {
    logger.error("SerpAPI weight lookup failed", {
      productName,
      error: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

/**
 * Extract weight from a text snippet using pattern matching.
 * Returns weight in lbs, or null if not found.
 */
function extractWeightFromText(text: string): number | null {
  if (!text) return null;

  for (const pattern of WEIGHT_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]) {
      const weight = parseWeight(match[1]);
      if (weight && weight > 0 && weight < 100) {
        // Sanity check: reject unreasonable weights
        return weight;
      }
    }
  }

  return null;
}
