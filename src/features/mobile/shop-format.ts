/** Display helpers for the app's Shop. Pure. */

const SHORT: Record<string, string> = {
  "video games": "Games",
  "cell phones & accessories": "Phones",
  "musical instruments": "Music",
  "home & kitchen": "Home",
  "kitchen & dining": "Kitchen",
  "beauty & personal care": "Beauty",
  "tools & home improvement": "Tools",
  "clothing, shoes & jewelry": "Fashion",
  "toys & games": "Toys",
  "sports & outdoors": "Sports",
  "health & household": "Health",
  "office products": "Office",
  "office electronics": "Office tech",
  "pet supplies": "Pets",
  "automotive": "Auto",
  "camera & photo": "Cameras",
  "headphones": "Audio",
  "wearable technology": "Wearables",
  "smart home": "Smart home",
  "tv & video": "TV",
  "skin care": "Skin care",
  "hair care": "Hair",
  "luggage & travel gear": "Travel",
  "men's clothing": "Men",
  "women's clothing": "Women",
  "men's shoes": "Men's shoes",
  "women's shoes": "Women's shoes",
  "handbags & wallets": "Bags",
  "vitamins & dietary supplements": "Vitamins",
  "car electronics & accessories": "Car tech",
  "fashion accessories": "Accessories",
  "exercise & fitness": "Fitness",
  "arts, crafts & sewing": "Crafts",
  "baby": "Baby",
};

/** "Cell Phones & Accessories" → "Phones": one word or two, so a chip never wraps. */
export function shortCategory(label: string): string {
  const known = SHORT[label.trim().toLowerCase()];
  if (known) return known;
  const first = label.split(/[&,]/)[0]!.trim();
  return first.length > 14 ? `${first.slice(0, 13).trimEnd()}…` : first;
}

/** 1234 → "1.2k", 87 → "87". */
export function compactCount(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}m`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  return String(n);
}

/**
 * Drops listings that are the same product in another colour or bundle, so a shelf shows
 * four different things rather than four Nintendo Switches. Keyed on the first words of
 * the title.
 */
export function distinctByTitle<T extends { title: string }>(items: readonly T[], words = 2): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const key = item.title.toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/).filter(Boolean).slice(0, words).join(" ");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(item);
  }
  return out;
}
