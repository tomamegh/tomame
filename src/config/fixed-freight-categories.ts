import { TomameCategory as C } from "./categories/tomame_category";

/**
 * Which Tomame categories each `fixed_freight_items.category` may price.
 *
 * The fixed-freight table groups its rows by a buyer's shelf ("MAC & LAPTOPS",
 * "WATCHES", …), not by `TomameCategory`, so a keyword hit alone cannot tell a
 * gaming laptop from a hoodie that says "Women". A fixed item only applies when
 * the product's category is in its set here; a product with no category (or
 * `Other`) is ungated and relies on the keyword match alone.
 *
 * Keys are the prod values, upper-cased. A fixed category missing from this map
 * is ungated too, so an admin adding a new shelf does not silently lose its
 * negotiated rate — but it should be added here when it appears.
 */
export const FIXED_FREIGHT_CATEGORY_MAP: Readonly<Record<string, ReadonlySet<C>>> = {
  IPHONE: new Set([C.CELL_PHONES, C.ELECTRONICS]),
  ANDROID: new Set([C.CELL_PHONES, C.ELECTRONICS]),
  IPAD: new Set([C.COMPUTERS, C.ELECTRONICS, C.CELL_PHONES]),
  "MAC & LAPTOPS": new Set([C.COMPUTERS, C.ELECTRONICS, C.OFFICE_ELECTRONICS]),
  "APPLE WATCH": new Set([C.WEARABLE_TECHNOLOGY, C.WATCHES, C.ELECTRONICS, C.CELL_PHONES]),
  WATCHES: new Set([C.WATCHES, C.WEARABLE_TECHNOLOGY, C.JEWELRY, C.FASHION_ACCESSORIES, C.ELECTRONICS, C.CELL_PHONES]),
  AUDIO: new Set([C.HEADPHONES, C.ELECTRONICS, C.CELL_PHONES, C.SMART_HOME, C.TV_VIDEO]),
  GAMING: new Set([C.VIDEO_GAMES, C.ELECTRONICS, C.TOYS_GAMES]),
  FRAGRANCE: new Set([C.FRAGRANCE, C.BEAUTY, C.PERSONAL_CARE]),
  AUTOMOTIVE: new Set([C.AUTOMOTIVE, C.CAR_CARE, C.CAR_ELECTRONICS]),
  // Apple TV, Ray-Ban Meta, Deeper Connect, Apple Keyboard, Fire HD, Apple Pencil, Magic Mouse, AirTag.
  ACCESSORIES: new Set([
    C.ELECTRONICS,
    C.COMPUTERS,
    C.CELL_PHONES,
    C.TV_VIDEO,
    C.SMART_HOME,
    C.WEARABLE_TECHNOLOGY,
    C.OFFICE_ELECTRONICS,
    C.FASHION_ACCESSORIES,
  ]),
};

/**
 * Nouns that make a title an accessory FOR the product rather than the product:
 * "laptop stand", "watch band", "case for iPhone 15". A noun that appears in the
 * fixed item's own name or keywords ("PS Controllers", "Apple Keyboard") never
 * disqualifies that item. Singular only; plurals ("-s", "-es") are matched too.
 */
export const FIXED_FREIGHT_ACCESSORY_NOUNS: readonly string[] = [
  "case", "cover", "sleeve", "bag", "backpack", "pouch", "skin", "shell", "bumper",
  "stand", "mount", "holder", "dock", "cradle", "tray", "organizer",
  "charger", "charging", "cable", "adapter", "hub", "battery",
  "band", "strap", "protector", "tempered", "film", "decal", "sticker",
  "controller", "remote", "grip", "stylus", "keyboard", "mouse", "headset",
  "cooler", "cooling",
];

/**
 * Words that, after an accessory noun and before the product keyword, mark the
 * product as what the accessory fits: "Case compatible with iPhone 15".
 */
export const FIXED_FREIGHT_ACCESSORY_CONNECTORS: readonly string[] = ["for", "compatible", "fits", "fit", "designed"];
