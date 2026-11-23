/**
 * Catalogue tidying rules (site brief, Fix 4). Pure, no I/O.
 *
 * - displayTitle: strips listing boilerplate the store appends to a title
 *   ("Global Recycled Standard", repeated, often cut off mid-word).
 * - titleKey: what makes two rows the same product at the same store. Amazon
 *   lists every size and colour of "Crocs Classic Clogs - Glitter" under its own
 *   ASIN at its own price; to a shopper they are one product.
 * - departmentFor: a product's department from its own title. A row used to
 *   inherit the department of whichever search found it, so a "Baby" query that
 *   returned wrist braces filed them under Baby, and a men's polo pasted under a
 *   women's category seeded a whole "Women's Clothing" search of men's polos.
 * - pickKeeper: which duplicate stays, and the note saying why its price is the
 *   current one.
 */

/** Badges and certifications a store appends to titles. Matched only as a trailing run. */
const BOILERPLATE = ["Global Recycled Standard", "Climate Pledge Friendly"];

/**
 * One phrase off the end of a title, as often as it repeats. The vendor cuts long
 * titles, so the last copy may stop mid-word ("Global Recycled Standa"). A cut
 * copy counts from six characters ("Global") up.
 */
function stripTrailing(title: string, phrase: string): string {
  const lower = phrase.toLowerCase();
  const firstWord = lower.split(" ")[0]!;
  let out = title;
  for (;;) {
    const trimmed = out.replace(/[\s,;|-]+$/, "");
    const lo = trimmed.toLowerCase();
    if (lo.endsWith(` ${lower}`)) {
      out = trimmed.slice(0, trimmed.length - lower.length);
      continue;
    }
    const at = lo.lastIndexOf(` ${firstWord}`);
    const tail = at > 0 ? lo.slice(at + 1) : "";
    if (tail.length >= 6 && lower.startsWith(tail)) {
      out = trimmed.slice(0, at);
      continue;
    }
    return trimmed;
  }
}

export function displayTitle(title: string | null | undefined): string {
  let out = (title ?? "").replace(/\s+/g, " ").trim();
  for (const phrase of BOILERPLATE) out = stripTrailing(out, phrase);
  return out;
}

export function titleKey(title: string | null | undefined): string {
  return displayTitle(title)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// ── Departments ─────────────────────────────────────────────────────────────

/** Words that say what a product is, for the departments that keep being mis-filed. */
const SIGNALS: ReadonlyArray<{ department: string; re: RegExp }> = [
  { department: "Musical Instruments", re: /\b(guitars?|ukuleles?|violins?|violas?|cellos?|pianos?|digital piano|drums?|drum set|cymbals?|saxophones?|trumpets?|trombones?|clarinets?|flutes?|harmonicas?|banjos?|mandolins?|kalimbas?|metronomes?|guitar picks?|capos?|midi (?:keyboard|controller)s?)\b/i },
  { department: "Cycling", re: /\b(bikes?|bicycles?|e-?bikes?|cycling|cyclists?|derailleurs?|handlebars?|bike (?:helmet|lock|light|pump|rack)s?)\b/i },
  { department: "Baby", re: /\b(baby|babies|infants?|newborns?|toddlers?|strollers?|diapers?|cribs?|bassinets?|pacifiers?|nursery|onesies?|teethers?|teething|bottle warmers?|breast pumps?|bibs?|sippy|playpens?|baby carriers?|car seats?|travel systems?|prams?|pushchairs?|maxi-?cosi|evenflo|graco|uppababy|chicco|bugaboo|nuna|cybex)\b/i },
  { department: "Health & Household", re: /\b(wrist (?:brace|support|wrap|sleeve)s?|knee (?:brace|sleeve)s?|braces?|compression sleeves?|heating pads?|carpal tunnel|tendonitis|arthritis|red light therapy|massagers?|tens unit)\b/i },
  { department: "Skin Care", re: /\b(exfoli\w*|face scrub|body scrub|serums?|moisturi[sz]ers?|cleansers?|sunscreen|toners?|retinol)\b/i },
  { department: "Appliances", re: /\b(space heaters?|heaters?|air fryers?|dehumidifiers?|humidifiers?|air purifiers?|vacuum cleaners?|robot vacuums?)\b/i },
  { department: "Home & Kitchen", re: /\b(fire pits?|patio|outdoor furniture|gazebos?|garden hose|grills?)\b/i },
  { department: "Handbags & Wallets", re: /\b(handbags?|shoulder bags?|crossbody|tote bags?|totes?|purses?|clutch(?:es)?|wallets?)\b/i },
  { department: "Fashion Accessories", re: /\b(sunglasses|eyeglass frames)\b/i },
  { department: "Toys & Games", re: /\b(toys?|lego|dolls?|puzzles?|board games?|action figures?|plush)\b/i },
];

/** A department's own words: a title that has them belongs there whatever else it mentions. */
const OWN: Record<string, RegExp> = {
  "Musical Instruments": SIGNALS[0]!.re,
  Cycling: SIGNALS[1]!.re,
  Baby: SIGNALS[2]!.re,
  "Women's Clothing": /\b(dress(?:es)?|shirts?|t-?shirts?|tees?|polos?|blouses?|tops?|pants|jeans|leggings|skirts?|jackets?|coats?|hoodies?|sweaters?|shorts|underwear|bras?|socks|suits?|swimsuits?|bikinis?|jumpsuits?|rompers?|vests?|cardigans?|pajamas?|lingerie|panties|briefs|tank|camisoles?|gowns?|knit|sweatshirts?|joggers|trousers|outfits?|sets?|tunics?|kimonos?|bodysuits?|shirtdress(?:es)?|sheath|maxi|midi|blazers?|overalls)\b/i,
  "Women's Shoes": /\b(shoes?|sneakers?|boots?|booties|sandals?|heels?|heeled|loafers?|slippers?|clogs?|mules?|flats|pumps?|trainers?|cleats?|oxfords?|moccasins?|slides?|footwear|espadrilles?|wedges?)\b/i,
};
OWN["Men's Clothing"] = OWN["Women's Clothing"]!;
OWN["Men's Shoes"] = OWN["Women's Shoes"]!;

/** Departments whose own words a product must carry; one that carries none is filed by its other words, or under Other. */
const GUARDED = new Set(["Musical Instruments", "Cycling", "Baby"]);

const WOMEN = /\b(women'?s?|womens|woman|ladies|lady'?s|girls'?|girl'?s)\b/i;
const MEN = /\b(men'?s?|mens|man'?s|boys'?|boy'?s)\b/i;
const UNISEX = /\b(unisex|men and women|women and men|men & women|women & men|men'?s and women'?s|women'?s and men'?s|adults?)\b/i;

/** "Women's Shoes" ↔ "Men's Shoes" when the title is plainly for the other one. */
function genderSwap(department: string, title: string): string | null {
  if (UNISEX.test(title)) return null;
  const women = WOMEN.test(title);
  const men = MEN.test(title.replace(/\bwom[ae]n'?s?\b|\bwomens\b/gi, ""));
  if (department.startsWith("Women's ") && men && !women) return department.replace("Women's", "Men's");
  if (department.startsWith("Men's ") && women && !men) return department.replace("Men's", "Women's");
  return null;
}

/**
 * A product's department from its title, starting from the one it was filed
 * under (`prior`, the search's or the store's).
 * 1. Clothing and shoes follow the title's gender (a men's polo is not
 *    Women's Clothing).
 * 2. A title with the department's own words stays.
 * 3. Otherwise a title that plainly says what it is moves there (a wrist brace
 *    found by a "Baby" search is Health & Household; a fire pit found by a bike
 *    search is Home & Kitchen; a space heater is Appliances).
 * 4. A guarded department (Baby, Cycling, Musical Instruments) keeps only what
 *    carries its words; anything else goes under Other rather than stay wrong.
 */
export function departmentFor(title: string | null | undefined, prior: string | null | undefined): string | null {
  const t = displayTitle(title);
  const from = prior?.trim() || null;
  if (!from || !t) return from;
  let department = genderSwap(from, t) ?? from;

  const own = OWN[department];
  if (own?.test(t)) return department;

  const signal = SIGNALS.find((s) => s.department !== department && s.re.test(t));
  // Clothing and shoes move only for a strong other signal, never into Baby/Toys on a stray word.
  if (signal && (GUARDED.has(department) || own)) {
    if (own && (signal.department === "Baby" || signal.department === "Toys & Games")) return department;
    return signal.department;
  }
  if (GUARDED.has(department)) department = "Other";
  return department;
}

// ── Duplicates ──────────────────────────────────────────────────────────────

export interface DuplicateCandidate {
  id: string;
  price_usd: number | null;
  landed_ghs: number | null;
  last_seen_at: string;
}

/**
 * Which of several listings of one product at one store stays: a priced one
 * first, then the most recently seen (the current price), then the lowest
 * price. The note records why, for the kept row.
 */
export function pickKeeper<T extends DuplicateCandidate>(rows: readonly T[], storeName: string): { keep: T; drop: T[]; note: string } {
  const day = (iso: string) => iso.slice(0, 10);
  const sorted = [...rows].sort((a, b) => {
    if ((a.landed_ghs == null) !== (b.landed_ghs == null)) return a.landed_ghs == null ? 1 : -1;
    if (day(a.last_seen_at) !== day(b.last_seen_at)) return day(a.last_seen_at) < day(b.last_seen_at) ? 1 : -1;
    const pa = a.price_usd ?? Number.POSITIVE_INFINITY;
    const pb = b.price_usd ?? Number.POSITIVE_INFINITY;
    if (pa !== pb) return pa - pb;
    return a.id < b.id ? -1 : 1;
  });
  const keep = sorted[0]!;
  const drop = sorted.slice(1);
  const prices = rows.map((r) => r.price_usd).filter((p): p is number => p != null && p > 0);
  const range = prices.length ? `$${Math.min(...prices).toFixed(2)}–$${Math.max(...prices).toFixed(2)}` : "no prices";
  const note = `Kept over ${drop.length} other ${drop.length === 1 ? "listing" : "listings"} of this product at ${storeName} (${range}): the ${keep.landed_ghs != null ? "priced, " : ""}most recently seen (${day(keep.last_seen_at)}) at the lowest price that day, $${(keep.price_usd ?? 0).toFixed(2)}.`;
  return { keep, drop, note };
}
