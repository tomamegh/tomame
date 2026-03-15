import { TomameCategory } from "./tomame_category";

// Fashion Nova category strings mapped to Tomame categories
// Fashion Nova uses breadcrumb names like "Women's Dresses", "Men's Tops", etc.
export const FASHIONNOVA_CATEGORY_MAP = new Map<string, TomameCategory>([
  // Women's Clothing
  ["women", TomameCategory.CLOTHING_WOMEN],
  ["Women", TomameCategory.CLOTHING_WOMEN],
  ["Women's Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Women's Dresses", TomameCategory.CLOTHING_WOMEN],
  ["Dresses", TomameCategory.CLOTHING_WOMEN],
  ["Maxi Dresses", TomameCategory.CLOTHING_WOMEN],
  ["Mini Dresses", TomameCategory.CLOTHING_WOMEN],
  ["Midi Dresses", TomameCategory.CLOTHING_WOMEN],
  ["Women's Tops", TomameCategory.CLOTHING_WOMEN],
  ["Tops", TomameCategory.CLOTHING_WOMEN],
  ["Bodysuits", TomameCategory.CLOTHING_WOMEN],
  ["Women's Bottoms", TomameCategory.CLOTHING_WOMEN],
  ["Bottoms", TomameCategory.CLOTHING_WOMEN],
  ["Skirts", TomameCategory.CLOTHING_WOMEN],
  ["Jumpsuits & Rompers", TomameCategory.CLOTHING_WOMEN],
  ["Jumpsuits", TomameCategory.CLOTHING_WOMEN],
  ["Rompers", TomameCategory.CLOTHING_WOMEN],
  ["Matching Sets", TomameCategory.CLOTHING_WOMEN],
  ["Sets", TomameCategory.CLOTHING_WOMEN],
  ["Jackets & Sweaters", TomameCategory.CLOTHING_WOMEN],
  ["Jackets", TomameCategory.CLOTHING_WOMEN],
  ["Sweaters", TomameCategory.CLOTHING_WOMEN],
  ["Coats", TomameCategory.CLOTHING_WOMEN],
  ["Women's Jeans", TomameCategory.CLOTHING_WOMEN],
  ["Jeans", TomameCategory.CLOTHING_WOMEN],
  ["Leggings", TomameCategory.CLOTHING_WOMEN],
  ["Pants", TomameCategory.CLOTHING_WOMEN],
  ["Shorts", TomameCategory.CLOTHING_WOMEN],
  ["Swim", TomameCategory.CLOTHING_WOMEN],
  ["Swimwear", TomameCategory.CLOTHING_WOMEN],
  ["Lingerie & Sleep", TomameCategory.CLOTHING_WOMEN],
  ["Lingerie", TomameCategory.CLOTHING_WOMEN],
  ["Sleepwear", TomameCategory.CLOTHING_WOMEN],
  ["Plus Size", TomameCategory.CLOTHING_WOMEN],
  ["Plus+Curve", TomameCategory.CLOTHING_WOMEN],
  ["Curve", TomameCategory.CLOTHING_WOMEN],
  ["Formal Shop", TomameCategory.CLOTHING_WOMEN],
  ["Graphic Tees", TomameCategory.CLOTHING_WOMEN],
  ["Graphics", TomameCategory.CLOTHING_WOMEN],

  // Men's Clothing
  ["Men", TomameCategory.CLOTHING_MEN],
  ["Men's Clothing", TomameCategory.CLOTHING_MEN],
  ["Men's Tops", TomameCategory.CLOTHING_MEN],
  ["Men's Bottoms", TomameCategory.CLOTHING_MEN],
  ["Men's Jeans", TomameCategory.CLOTHING_MEN],
  ["Men's Shorts", TomameCategory.CLOTHING_MEN],
  ["Men's Jackets", TomameCategory.CLOTHING_MEN],
  ["Men's Sets", TomameCategory.CLOTHING_MEN],

  // Kids
  ["Kids", TomameCategory.CLOTHING_KIDS],
  ["Kids' Clothing", TomameCategory.CLOTHING_KIDS],
  ["Girls", TomameCategory.CLOTHING_KIDS],
  ["Boys", TomameCategory.CLOTHING_KIDS],

  // Shoes
  ["Shoes", TomameCategory.SHOES_WOMEN],
  ["Women's Shoes", TomameCategory.SHOES_WOMEN],
  ["Heels", TomameCategory.SHOES_WOMEN],
  ["Boots", TomameCategory.SHOES_WOMEN],
  ["Sandals", TomameCategory.SHOES_WOMEN],
  ["Sneakers", TomameCategory.SHOES_WOMEN],
  ["Men's Shoes", TomameCategory.SHOES_MEN],

  // Accessories
  ["Accessories", TomameCategory.FASHION_ACCESSORIES],
  ["Jewelry", TomameCategory.JEWELRY],
  ["Bags", TomameCategory.HANDBAGS],
  ["Handbags", TomameCategory.HANDBAGS],
  ["Sunglasses", TomameCategory.FASHION_ACCESSORIES],
  ["Hats", TomameCategory.FASHION_ACCESSORIES],
  ["Belts", TomameCategory.FASHION_ACCESSORIES],

  // Beauty
  ["Beauty", TomameCategory.BEAUTY],
  ["Makeup", TomameCategory.MAKEUP],
  ["Skin Care", TomameCategory.SKINCARE],
  ["Hair Care", TomameCategory.HAIRCARE],
  ["Fragrance", TomameCategory.FRAGRANCE],

  // Sport / Active
  ["Sport", TomameCategory.EXERCISE_FITNESS],
  ["Activewear", TomameCategory.EXERCISE_FITNESS],
  ["Nova Sport", TomameCategory.EXERCISE_FITNESS],
]);
