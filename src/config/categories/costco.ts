import { TomameCategory } from "./tomame_category";

// Costco category strings mapped to Tomame categories (shippable items only)
export const COSTCO_CATEGORY_MAP = new Map<string, TomameCategory>([
  // Electronics & Computers
  ["Electronics", TomameCategory.ELECTRONICS],
  ["Computers", TomameCategory.COMPUTERS],
  ["Computers & Tablets", TomameCategory.COMPUTERS],
  ["Laptops", TomameCategory.COMPUTERS],
  ["Desktops & All-in-Ones", TomameCategory.COMPUTERS],
  ["Tablets", TomameCategory.COMPUTERS],
  ["Cell Phones", TomameCategory.CELL_PHONES],
  ["Phones & Plans", TomameCategory.CELL_PHONES],
  ["TVs", TomameCategory.TV_VIDEO],
  ["Televisions", TomameCategory.TV_VIDEO],
  ["TV & Video", TomameCategory.TV_VIDEO],
  ["Cameras", TomameCategory.CAMERA_PHOTO],
  ["Cameras, Camcorders & Drones", TomameCategory.CAMERA_PHOTO],
  ["Headphones & Speakers", TomameCategory.HEADPHONES],
  ["Headphones", TomameCategory.HEADPHONES],
  ["Speakers", TomameCategory.HEADPHONES],
  ["Video Games", TomameCategory.VIDEO_GAMES],
  ["Gaming", TomameCategory.VIDEO_GAMES],
  ["Wearable Technology", TomameCategory.WEARABLE_TECHNOLOGY],
  ["Smart Home", TomameCategory.SMART_HOME],
  ["Smart Home & Security", TomameCategory.SMART_HOME],

  // Home & Garden
  ["Home", TomameCategory.HOME_KITCHEN],
  ["Home & Kitchen", TomameCategory.HOME_KITCHEN],
  ["Home Décor", TomameCategory.HOME_KITCHEN],
  ["Home Decor", TomameCategory.HOME_KITCHEN],
  ["Kitchen & Dining", TomameCategory.KITCHEN_DINING],
  ["Kitchen", TomameCategory.KITCHEN_DINING],
  ["Small Kitchen Appliances", TomameCategory.KITCHEN_DINING],
  ["Cookware", TomameCategory.KITCHEN_DINING],
  ["Furniture", TomameCategory.FURNITURE],
  ["Living Room Furniture", TomameCategory.FURNITURE],
  ["Bedroom Furniture", TomameCategory.FURNITURE],
  ["Office Furniture", TomameCategory.OFFICE_FURNITURE],
  ["Bedding", TomameCategory.BEDDING],
  ["Bed & Bath", TomameCategory.BEDDING],
  ["Bath", TomameCategory.BATH],
  ["Patio, Lawn & Garden", TomameCategory.GARDEN_OUTDOOR],
  ["Patio & Outdoor", TomameCategory.GARDEN_OUTDOOR],
  ["Outdoor", TomameCategory.GARDEN_OUTDOOR],
  ["Appliances", TomameCategory.APPLIANCES],
  ["Large Appliances", TomameCategory.APPLIANCES],
  ["Home Improvement", TomameCategory.HOME_IMPROVEMENT],
  ["Hardware", TomameCategory.HOME_IMPROVEMENT],
  ["Tools", TomameCategory.TOOLS],
  ["Lighting", TomameCategory.LIGHTING],
  ["Storage & Organization", TomameCategory.HOME_KITCHEN],
  ["Housewares", TomameCategory.HOME_KITCHEN],

  // Fashion & Clothing
  ["Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Clothing & Accessories", TomameCategory.CLOTHING_WOMEN],
  ["Women's Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Women", TomameCategory.CLOTHING_WOMEN],
  ["Men's Clothing", TomameCategory.CLOTHING_MEN],
  ["Men", TomameCategory.CLOTHING_MEN],
  ["Kids' Clothing", TomameCategory.CLOTHING_KIDS],
  ["Kids", TomameCategory.CLOTHING_KIDS],
  ["Shoes", TomameCategory.SHOES_WOMEN],
  ["Women's Shoes", TomameCategory.SHOES_WOMEN],
  ["Men's Shoes", TomameCategory.SHOES_MEN],
  ["Kids' Shoes", TomameCategory.SHOES_KIDS],
  ["Jewelry", TomameCategory.JEWELRY],
  ["Fine Jewelry", TomameCategory.JEWELRY],
  ["Watches", TomameCategory.WATCHES],
  ["Handbags & Accessories", TomameCategory.HANDBAGS],
  ["Handbags", TomameCategory.HANDBAGS],
  ["Luggage", TomameCategory.LUGGAGE],
  ["Luggage & Travel", TomameCategory.LUGGAGE],

  // Beauty & Personal Care
  ["Beauty", TomameCategory.BEAUTY],
  ["Beauty & Personal Care", TomameCategory.BEAUTY],
  ["Skin Care", TomameCategory.SKINCARE],
  ["Makeup", TomameCategory.MAKEUP],
  ["Hair Care", TomameCategory.HAIRCARE],
  ["Fragrance", TomameCategory.FRAGRANCE],
  ["Personal Care", TomameCategory.PERSONAL_CARE],

  // Health & Wellness
  ["Health & Beauty", TomameCategory.HEALTH_HOUSEHOLD],
  ["Health", TomameCategory.HEALTH_HOUSEHOLD],
  ["Health & Household", TomameCategory.HEALTH_HOUSEHOLD],
  ["Vitamins & Supplements", TomameCategory.VITAMINS_SUPPLEMENTS],
  ["Vitamins", TomameCategory.VITAMINS_SUPPLEMENTS],
  ["Medical Supplies", TomameCategory.MEDICAL_SUPPLIES],
  ["Wellness", TomameCategory.WELLNESS_RELAXATION],

  // Sports & Outdoors
  ["Sports & Outdoors", TomameCategory.SPORTS_OUTDOORS],
  ["Sports", TomameCategory.SPORTS_OUTDOORS],
  ["Exercise & Fitness", TomameCategory.EXERCISE_FITNESS],
  ["Fitness Equipment", TomameCategory.EXERCISE_FITNESS],
  ["Outdoor Recreation", TomameCategory.OUTDOOR_RECREATION],
  ["Bikes", TomameCategory.CYCLING],
  ["Cycling", TomameCategory.CYCLING],

  // Baby & Kids
  ["Baby", TomameCategory.BABY],
  ["Baby & Toddler", TomameCategory.BABY],
  ["Baby Products", TomameCategory.BABY],
  ["Toys", TomameCategory.TOYS_GAMES],
  ["Toys & Games", TomameCategory.TOYS_GAMES],

  // Automotive
  ["Auto & Tires", TomameCategory.AUTOMOTIVE],
  ["Automotive", TomameCategory.AUTOMOTIVE],
  ["Tires", TomameCategory.AUTOMOTIVE],
  ["Auto", TomameCategory.AUTOMOTIVE],

  // Books & Media
  ["Books", TomameCategory.BOOKS],
  ["Music", TomameCategory.MUSIC],
  ["Movies & TV", TomameCategory.MOVIES_TV],
  ["Movies", TomameCategory.MOVIES_TV],

  // Office & School
  ["Office", TomameCategory.OFFICE_PRODUCTS],
  ["Office Products", TomameCategory.OFFICE_PRODUCTS],
  ["Office Supplies", TomameCategory.OFFICE_PRODUCTS],

  // Pet Supplies
  ["Pet Supplies", TomameCategory.PET_SUPPLIES],
  ["Pets", TomameCategory.PET_SUPPLIES],

  // Arts & Crafts
  ["Arts & Crafts", TomameCategory.ARTS_CRAFTS],
  ["Craft Supplies", TomameCategory.CRAFT_SUPPLIES],
]);
