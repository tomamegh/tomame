import { searchGoogle } from "@/lib/serpapi/client";
import { logger } from "@/lib/logger";

/**
 * Result of a weight search via SerpAPI.
 */
export interface WeightSearchResult {
  found: boolean;
  /** Weight in lbs (null if not found) */
  weightLbs: number | null;
  /** Raw text that was parsed */
  rawText: string | null;
  /** Source URL where weight was found */
  sourceUrl: string | null;
}

// ── Weight parsing helpers ──────────────────────────────────────────────────

/** Convert various weight units to lbs */
function toLbs(value: number, unit: string): number {
  const u = unit.toLowerCase().replace(/\.$/, "");
  switch (u) {
    case "lb":
    case "lbs":
    case "pound":
    case "pounds":
      return value;
    case "oz":
    case "ounce":
    case "ounces":
      return value / 16;
    case "kg":
    case "kilogram":
    case "kilograms":
      return value * 2.20462;
    case "g":
    case "gram":
    case "grams":
      return (value / 1000) * 2.20462;
    default:
      return value; // Assume lbs if unknown
  }
}

/**
 * Try to extract a weight value from a text snippet.
 * Matches patterns like "1.5 lbs", "200 grams", "0.5 kg", "12.3 oz", etc.
 * Returns the weight in lbs or null if no match.
 */
function parseWeightFromText(text: string): { weightLbs: number; rawMatch: string } | null {
  // Patterns: "X.X lbs", "X.X pounds", "X.X oz", "X.X kg", "X.X g", "X.X grams"
  // Also handles "Weight: X.X lbs" and "weighs X.X lbs"
  const patterns = [
    /(\d+\.?\d*)\s*(lbs?|pounds?|oz|ounces?|kg|kilograms?|grams?|g)\b/gi,
  ];

  for (const pattern of patterns) {
    let match: RegExpExecArray | null;
    // Reset lastIndex for global regex
    pattern.lastIndex = 0;
    while ((match = pattern.exec(text)) !== null) {
      const value = parseFloat(match[1]!);
      const unit = match[2]!;
      if (value > 0 && value < 500) {
        // Sanity check: product weight should be < 500 lbs
        const weightLbs = Math.round(toLbs(value, unit) * 100) / 100;
        if (weightLbs > 0 && weightLbs < 500) {
          return { weightLbs, rawMatch: match[0] };
        }
      }
    }
  }

  return null;
}

// ── Main search function ────────────────────────────────────────────────────

/**
 * Search the internet for a product's weight using SerpAPI.
 * Queries "[product name] weight specs" and parses weight from the top results.
 *
 * Targets manufacturer pages, GSMArena, Apple.com, CNET, RTINGS as
 * specified in the Pricing Model PDF.
 */
export async function searchProductWeight(
  productName: string,
): Promise<WeightSearchResult> {
  if (!productName || productName.trim().length === 0) {
    return { found: false, weightLbs: null, rawText: null, sourceUrl: null };
  }

  const query = `${productName} weight specs`;

  const searchResult = await searchGoogle({
    query,
    num: 8,
    timeout: 15000,
  });

  if (!searchResult.success || searchResult.results.length === 0) {
    logger.info("Weight search returned no results", { query });
    return { found: false, weightLbs: null, rawText: null, sourceUrl: null };
  }

  // Prioritise trusted sources
  const trustedDomains = [
    "apple.com",
    "gsmarena.com",
    "cnet.com",
    "rtings.com",
    "samsung.com",
    "sony.com",
    "bose.com",
    "jbl.com",
    "nintendo.com",
    "playstation.com",
    "xbox.com",
    "microsoft.com",
    "dell.com",
    "hp.com",
    "lenovo.com",
  ];

  // Sort: trusted domains first, then by position
  const sorted = [...searchResult.results].sort((a, b) => {
    const aIsTrusted = trustedDomains.some((d) => a.link.includes(d));
    const bIsTrusted = trustedDomains.some((d) => b.link.includes(d));
    if (aIsTrusted && !bIsTrusted) return -1;
    if (!aIsTrusted && bIsTrusted) return 1;
    return a.position - b.position;
  });

  // Try to parse weight from each result's snippet
  for (const result of sorted) {
    const combined = `${result.title} ${result.snippet}`;
    const parsed = parseWeightFromText(combined);
    if (parsed) {
      logger.info("Weight found via internet search", {
        query,
        weightLbs: parsed.weightLbs,
        rawMatch: parsed.rawMatch,
        source: result.link,
      });
      return {
        found: true,
        weightLbs: parsed.weightLbs,
        rawText: parsed.rawMatch,
        sourceUrl: result.link,
      };
    }
  }

  logger.info("Weight not found in search results", { query });
  return { found: false, weightLbs: null, rawText: null, sourceUrl: null };
}
