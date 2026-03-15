import { TomameCategory } from "./tomame_category";

// Target category strings mapped to Tomame categories (shippable items only)
export const TARGET_CATEGORY_MAP = new Map<string, TomameCategory>([
  // Electronics & Computers
  ["Electronics", TomameCategory.ELECTRONICS],
  ["Computers & Office", TomameCategory.COMPUTERS],
  ["Laptops & Computers", TomameCategory.COMPUTERS],
  ["Tablets & E-Readers", TomameCategory.COMPUTERS],
  ["Cell Phones", TomameCategory.CELL_PHONES],
  ["Cell Phone Accessories", TomameCategory.CELL_PHONES],
  ["TVs & Home Theater", TomameCategory.TV_VIDEO],
  ["TVs", TomameCategory.TV_VIDEO],
  ["Cameras", TomameCategory.CAMERA_PHOTO],
  ["Cameras & Camcorders", TomameCategory.CAMERA_PHOTO],
  ["Headphones", TomameCategory.HEADPHONES],
  ["Headphones & Earbuds", TomameCategory.HEADPHONES],
  ["Video Games", TomameCategory.VIDEO_GAMES],
  ["Wearable Technology", TomameCategory.WEARABLE_TECHNOLOGY],
  ["Smart Home", TomameCategory.SMART_HOME],
  ["Speakers & Audio", TomameCategory.HEADPHONES],
  ["Portable Speakers", TomameCategory.HEADPHONES],

  // Home & Garden
  ["Home", TomameCategory.HOME_KITCHEN],
  ["Home Decor", TomameCategory.HOME_KITCHEN],
  ["Kitchen & Dining", TomameCategory.KITCHEN_DINING],
  ["Kitchen Appliances", TomameCategory.KITCHEN_DINING],
  ["Furniture", TomameCategory.FURNITURE],
  ["Living Room Furniture", TomameCategory.FURNITURE],
  ["Bedroom Furniture", TomameCategory.FURNITURE],
  ["Bedding", TomameCategory.BEDDING],
  ["Bath", TomameCategory.BATH],
  ["Bathroom", TomameCategory.BATH],
  ["Patio & Garden", TomameCategory.GARDEN_OUTDOOR],
  ["Outdoor Living & Garden", TomameCategory.GARDEN_OUTDOOR],
  ["Appliances", TomameCategory.APPLIANCES],
  ["Home Improvement", TomameCategory.HOME_IMPROVEMENT],
  ["Tools", TomameCategory.TOOLS],
  ["Lighting", TomameCategory.LIGHTING],
  ["Rugs", TomameCategory.HOME_KITCHEN],
  ["Storage & Organization", TomameCategory.HOME_KITCHEN],

  // Fashion & Clothing
  ["APPAREL", TomameCategory.CLOTHING_WOMEN],
  ["Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Clothing, Shoes & Accessories", TomameCategory.CLOTHING_WOMEN],
  ["Women's Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Women's Swimsuits", TomameCategory.CLOTHING_WOMEN],
  ["One-Piece Swimsuits", TomameCategory.CLOTHING_WOMEN],
  ["Women", TomameCategory.CLOTHING_WOMEN],
  ["Men's Clothing", TomameCategory.CLOTHING_MEN],
  ["Men", TomameCategory.CLOTHING_MEN],
  ["Kids' Clothing", TomameCategory.CLOTHING_KIDS],
  ["Kids", TomameCategory.CLOTHING_KIDS],
  ["Girls' Clothing", TomameCategory.CLOTHING_KIDS],
  ["Boys' Clothing", TomameCategory.CLOTHING_KIDS],
  ["Toddler Clothing", TomameCategory.CLOTHING_KIDS],
  ["Shoes", TomameCategory.SHOES_WOMEN],
  ["Women's Shoes", TomameCategory.SHOES_WOMEN],
  ["Men's Shoes", TomameCategory.SHOES_MEN],
  ["Kids' Shoes", TomameCategory.SHOES_KIDS],
  ["Jewelry", TomameCategory.JEWELRY],
  ["Watches", TomameCategory.WATCHES],
  ["Handbags", TomameCategory.HANDBAGS],
  ["Bags & Accessories", TomameCategory.HANDBAGS],
  ["Luggage", TomameCategory.LUGGAGE],
  ["Accessories", TomameCategory.FASHION_ACCESSORIES],

  // Beauty & Personal Care
  ["Beauty", TomameCategory.BEAUTY],
  ["Beauty & Personal Care", TomameCategory.BEAUTY],
  ["Skin Care", TomameCategory.SKINCARE],
  ["Makeup", TomameCategory.MAKEUP],
  ["Hair Care", TomameCategory.HAIRCARE],
  ["Fragrance", TomameCategory.FRAGRANCE],
  ["Personal Care", TomameCategory.PERSONAL_CARE],
  ["Premium Beauty", TomameCategory.BEAUTY],
  ["Ulta Beauty at Target", TomameCategory.BEAUTY],

  // Health & Wellness
  ["Health", TomameCategory.HEALTH_HOUSEHOLD],
  ["Health & Medicine", TomameCategory.HEALTH_HOUSEHOLD],
  ["Vitamins & Supplements", TomameCategory.VITAMINS_SUPPLEMENTS],
  ["First Aid", TomameCategory.MEDICAL_SUPPLIES],
  ["Wellness", TomameCategory.WELLNESS_RELAXATION],

  // Sports & Outdoors
  ["Sports & Outdoors", TomameCategory.SPORTS_OUTDOORS],
  ["Exercise & Fitness", TomameCategory.EXERCISE_FITNESS],
  ["Outdoor Recreation", TomameCategory.OUTDOOR_RECREATION],
  ["Sports Fan Shop", TomameCategory.SPORTS_FAN],
  ["Bikes", TomameCategory.CYCLING],
  ["Cycling", TomameCategory.CYCLING],

  // Baby & Kids
  ["Baby", TomameCategory.BABY],
  ["Baby Gear", TomameCategory.BABY],
  ["Nursery", TomameCategory.BABY],
  ["Toys", TomameCategory.TOYS_GAMES],
  ["Toys & Games", TomameCategory.TOYS_GAMES],

  // Automotive
  ["Automotive", TomameCategory.AUTOMOTIVE],
  ["Auto", TomameCategory.AUTOMOTIVE],

  // Books & Media (physical only)
  ["Books", TomameCategory.BOOKS],
  ["Music", TomameCategory.MUSIC],
  ["Movies", TomameCategory.MOVIES_TV],
  ["Movies, Music & Books", TomameCategory.BOOKS],
  ["Musical Instruments", TomameCategory.MUSICAL_INSTRUMENTS],

  // Office & School
  ["Office Supplies", TomameCategory.OFFICE_PRODUCTS],
  ["School Supplies", TomameCategory.SCHOOL_SUPPLIES],
  ["Office & School Supplies", TomameCategory.OFFICE_PRODUCTS],
  ["School & Office Supplies", TomameCategory.OFFICE_PRODUCTS],

  // Pet Supplies
  ["Pets", TomameCategory.PET_SUPPLIES],
  ["Pet Supplies", TomameCategory.PET_SUPPLIES],

  // Arts & Crafts
  ["Arts & Crafts", TomameCategory.ARTS_CRAFTS],
  ["Arts, Crafts & Sewing", TomameCategory.ARTS_CRAFTS],
  ["Craft Supplies", TomameCategory.CRAFT_SUPPLIES],

  // Collectibles
  ["Collectibles", TomameCategory.COLLECTIBLES],
]);
