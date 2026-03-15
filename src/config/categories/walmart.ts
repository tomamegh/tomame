import { TomameCategory } from "./tomame_category";

// Walmart category strings mapped to Tomame categories (shippable items only)
export const WALMART_CATEGORY_MAP = new Map<string, TomameCategory>([
  // Electronics & Computers
  ["Electronics", TomameCategory.ELECTRONICS],
  ["Computers", TomameCategory.COMPUTERS],
  ["Laptops", TomameCategory.COMPUTERS],
  ["Desktops", TomameCategory.COMPUTERS],
  ["Tablets", TomameCategory.COMPUTERS],
  ["Cell Phones", TomameCategory.CELL_PHONES],
  ["Cell Phone Accessories", TomameCategory.CELL_PHONES],
  ["TV & Video", TomameCategory.TV_VIDEO],
  ["TVs", TomameCategory.TV_VIDEO],
  ["Cameras & Camcorders", TomameCategory.CAMERA_PHOTO],
  ["Headphones", TomameCategory.HEADPHONES],
  ["Video Games", TomameCategory.VIDEO_GAMES],
  ["Wearable Technology", TomameCategory.WEARABLE_TECHNOLOGY],
  ["Smart Home", TomameCategory.SMART_HOME],
  ["Smart Home & Security", TomameCategory.SMART_HOME],
  ["Portable Audio", TomameCategory.HEADPHONES],

  // Home & Garden
  ["Home", TomameCategory.HOME_KITCHEN],
  ["Home & Kitchen", TomameCategory.HOME_KITCHEN],
  ["Kitchen & Dining", TomameCategory.KITCHEN_DINING],
  ["Furniture", TomameCategory.FURNITURE],
  ["Living Room Furniture", TomameCategory.FURNITURE],
  ["Bedroom Furniture", TomameCategory.FURNITURE],
  ["Bedding", TomameCategory.BEDDING],
  ["Bath", TomameCategory.BATH],
  ["Patio & Garden", TomameCategory.GARDEN_OUTDOOR],
  ["Garden Center", TomameCategory.GARDEN_OUTDOOR],
  ["Appliances", TomameCategory.APPLIANCES],
  ["Home Improvement", TomameCategory.HOME_IMPROVEMENT],
  ["Tools", TomameCategory.TOOLS],
  ["Lighting", TomameCategory.LIGHTING],

  // Fashion & Clothing
  ["Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Women's Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Women", TomameCategory.CLOTHING_WOMEN],
  ["Men's Clothing", TomameCategory.CLOTHING_MEN],
  ["Men", TomameCategory.CLOTHING_MEN],
  ["Kids' Clothing", TomameCategory.CLOTHING_KIDS],
  ["Kids", TomameCategory.CLOTHING_KIDS],
  ["Girls", TomameCategory.CLOTHING_KIDS],
  ["Boys", TomameCategory.CLOTHING_KIDS],
  ["Shoes", TomameCategory.SHOES_WOMEN],
  ["Women's Shoes", TomameCategory.SHOES_WOMEN],
  ["Men's Shoes", TomameCategory.SHOES_MEN],
  ["Kids' Shoes", TomameCategory.SHOES_KIDS],
  ["Jewelry", TomameCategory.JEWELRY],
  ["Watches", TomameCategory.WATCHES],
  ["Bags & Accessories", TomameCategory.HANDBAGS],
  ["Luggage", TomameCategory.LUGGAGE],
  ["Fashion Accessories", TomameCategory.FASHION_ACCESSORIES],

  // Beauty & Personal Care
  ["Beauty", TomameCategory.BEAUTY],
  ["Beauty & Personal Care", TomameCategory.BEAUTY],
  ["Skin Care", TomameCategory.SKINCARE],
  ["Makeup", TomameCategory.MAKEUP],
  ["Hair Care", TomameCategory.HAIRCARE],
  ["Fragrance", TomameCategory.FRAGRANCE],
  ["Personal Care", TomameCategory.PERSONAL_CARE],
  ["Premium Beauty", TomameCategory.BEAUTY],

  // Health & Wellness
  ["Health", TomameCategory.HEALTH_HOUSEHOLD],
  ["Health & Household", TomameCategory.HEALTH_HOUSEHOLD],
  ["Vitamins & Supplements", TomameCategory.VITAMINS_SUPPLEMENTS],
  ["Medical Supplies", TomameCategory.MEDICAL_SUPPLIES],
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
  ["Baby Products", TomameCategory.BABY],
  ["Toys", TomameCategory.TOYS_GAMES],
  ["Toys & Games", TomameCategory.TOYS_GAMES],

  // Automotive
  ["Auto & Tires", TomameCategory.AUTOMOTIVE],
  ["Automotive", TomameCategory.AUTOMOTIVE],
  ["Auto Parts", TomameCategory.AUTOMOTIVE],
  ["Car Care", TomameCategory.CAR_CARE],
  ["Car Electronics", TomameCategory.CAR_ELECTRONICS],

  // Books & Media (physical only)
  ["Books", TomameCategory.BOOKS],
  ["Music", TomameCategory.MUSIC],
  ["Movies & TV Shows", TomameCategory.MOVIES_TV],
  ["Movies & TV", TomameCategory.MOVIES_TV],
  ["Musical Instruments", TomameCategory.MUSICAL_INSTRUMENTS],

  // Office & School
  ["Office Supplies", TomameCategory.OFFICE_PRODUCTS],
  ["Office Products", TomameCategory.OFFICE_PRODUCTS],
  ["School Supplies", TomameCategory.SCHOOL_SUPPLIES],
  ["Office Furniture", TomameCategory.OFFICE_FURNITURE],
  ["Office Electronics", TomameCategory.OFFICE_ELECTRONICS],

  // Pet Supplies
  ["Pets", TomameCategory.PET_SUPPLIES],
  ["Pet Supplies", TomameCategory.PET_SUPPLIES],
  ["Dog", TomameCategory.PET_SUPPLIES],
  ["Cat", TomameCategory.PET_SUPPLIES],

  // Arts & Crafts
  ["Arts, Crafts & Sewing", TomameCategory.ARTS_CRAFTS],
  ["Arts & Crafts", TomameCategory.ARTS_CRAFTS],
  ["Craft Supplies", TomameCategory.CRAFT_SUPPLIES],
  ["Sewing", TomameCategory.ARTS_CRAFTS],

  // Collectibles
  ["Collectibles", TomameCategory.COLLECTIBLES],
]);
