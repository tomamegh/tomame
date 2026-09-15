import type { Icon } from "@phosphor-icons/react";
import {
  Armchair,
  Baby,
  Barbell,
  BookOpen,
  Car,
  DeviceMobile,
  GameController,
  Headphones,
  Heartbeat,
  Laptop,
  PawPrint,
  Scissors,
  Sparkle,
  SquaresFour,
  Storefront,
  Television,
  TShirt,
  Wrench,
} from "@phosphor-icons/react/ssr";

/**
 * One glyph per department, resolved from the label rather than declared per
 * shelf.
 *
 * WHY THIS IS A KEYWORD MATCH AND NOT A LOOKUP TABLE. The departments are not a
 * fixed list we own: they are whatever `catalog_categories` holds, which is
 * whatever the extraction pipeline stamped onto the products the scraper
 * happened to read. That vocabulary is `TomameCategory` today (`Cell Phones &
 * Accessories`, `Tools & Home Improvement`, …) but it is written into rows, not
 * read from the enum, so a keyed table would silently fall through to nothing
 * the first time a category is renamed, split, or arrives from a store map we
 * have not seen. A substring match degrades instead: `Kids' Shoes` and
 * `Women's Shoes` both find the same rule, and anything genuinely unknown gets
 * the shop front rather than a hole in the row.
 *
 * ORDER IS THE WHOLE DESIGN. Rules are tried in order and the first hit wins,
 * so the specific ones sit above the general ones they would otherwise be eaten
 * by: `Toys & Games` must reach Baby before `game` claims it, `Home
 * Improvement` must reach the spanner before `home` claims the armchair, and
 * `Video Games` must reach the controller before `video` claims the television.
 * Moving a rule up or down changes what other shelves get — the tests pin the
 * pairs that collide.
 *
 * NOTHING HERE IS A CLAIM ABOUT THE PRODUCT. The icon is wayfinding: it helps
 * somebody find the shelf they meant, and it is never read as a fact about what
 * is on it. That is why an unmatched label is allowed a neutral default instead
 * of being guessed at.
 */

interface DepartmentIconRule {
  /** Lower-case substrings; any one of them matching picks this icon. */
  readonly keywords: readonly string[];
  readonly icon: Icon;
}

const DEPARTMENT_ICON_RULES: readonly DepartmentIconRule[] = [
  // The synthetic "All categories" pill the search screen puts in front of the
  // real shelves. It is not a department, so it gets the only abstract glyph.
  { keywords: ["all categories", "everything"], icon: SquaresFour },

  // Small people before their things: "Toys & Games", "Kids' Clothing" and
  // "Kids' Shoes" would otherwise land on the controller and the t-shirt.
  {
    keywords: ["baby", "infant", "toddler", "nursery", "kid", "toy"],
    icon: Baby,
  },
  {
    keywords: ["game", "console", "playstation", "xbox", "nintendo"],
    icon: GameController,
  },

  // Headphones before phones, and it is not a preference: "Headphones" contains
  // "phone", so the handset rule would swallow the whole audio shelf.
  { keywords: ["headphone", "earbud", "earphone"], icon: Headphones },
  { keywords: ["phone", "mobile", "cell"], icon: DeviceMobile },
  { keywords: ["laptop", "computer", "monitor", "keyboard"], icon: Laptop },

  // Cars before screens: "Car Electronics & Accessories" is a car shelf, and
  // the electronics rule below would otherwise claim it. Every keyword here is
  // deliberately more than the bare string "car" — "Hair Care", "Skin Care" and
  // "Personal Care" all contain it, and a shampoo shelf wearing a car is the
  // kind of small wrongness that makes a whole row look automated.
  {
    keywords: [
      "automotive",
      "car care",
      "car electronic",
      "vehicle",
      "motorcycle",
    ],
    icon: Car,
  },

  // Physical media before screens: "Movies & TV" and "Music" both carry a
  // television keyword inside them.
  {
    keywords: ["book", "movie", "music", "instrument", "media"],
    icon: BookOpen,
  },
  {
    keywords: [
      "tv",
      "televis",
      "video",
      "camera",
      "photo",
      "electronic",
      "smart home",
      "wearable",
      "audio",
      "speaker",
    ],
    icon: Television,
  },

  {
    keywords: [
      "beaut",
      "hair",
      "skin",
      "makeup",
      "fragrance",
      "cosmetic",
      "personal care",
    ],
    icon: Sparkle,
  },
  {
    keywords: [
      "health",
      "vitamin",
      "supplement",
      "medical",
      "wellness",
      "pharmac",
    ],
    icon: Heartbeat,
  },
  {
    keywords: [
      "cloth",
      "shoe",
      "fashion",
      "apparel",
      "handbag",
      "jewel",
      "watch",
      "luggage",
    ],
    icon: TShirt,
  },

  // "Tools & Home Improvement" and "Home Improvement" are workshops, not living
  // rooms, so they have to be claimed before the home rule below.
  { keywords: ["tool", "hardware", "improvement", "diy"], icon: Wrench },

  // Desks and school bags before furniture: "Office Furniture" is an office.
  { keywords: ["office", "school", "stationer"], icon: BookOpen },

  {
    keywords: [
      "home",
      "kitchen",
      "furnitur",
      "bedding",
      "bath",
      "garden",
      "appliance",
      "lighting",
      "decor",
    ],
    icon: Armchair,
  },

  {
    keywords: ["sport", "fitness", "exercise", "outdoor", "cycling", "athlet"],
    icon: Barbell,
  },

  // "pet" only. "dog" and "cat" are both substrings of ordinary English words
  // ("All categories" carries "cat"), and this rule sits low enough that a
  // false positive here would be the last thing anything else could correct.
  { keywords: ["pet supplies", "pet care", "pets"], icon: PawPrint },
  { keywords: ["craft", "sewing", "fabric", "arts"], icon: Scissors },
];

/**
 * The glyph for a department label, case-insensitively.
 *
 * Never throws and never returns null: an unrecognised shelf is a shop front,
 * because a cell with no icon in a row of icons reads as a broken cell.
 */
export function departmentIcon(label: string): Icon {
  const haystack = label.toLowerCase();
  for (const rule of DEPARTMENT_ICON_RULES) {
    if (rule.keywords.some((keyword) => haystack.includes(keyword)))
      return rule.icon;
  }
  return Storefront;
}

/** The fallback, exported so tests can assert on it by identity rather than name. */
export const DEPARTMENT_FALLBACK_ICON: Icon = Storefront;
