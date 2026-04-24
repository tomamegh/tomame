import { TomameCategory } from "./tomame_category";

// eBay top-level category strings mapped to Tomame categories (shippable items only)
export const EBAY_CATEGORY_MAP = new Map<string, TomameCategory>([
  // Electronics & Computers
  ["Consumer Electronics", TomameCategory.ELECTRONICS],
  ["Computers/Tablets & Networking", TomameCategory.COMPUTERS],
  ["Computers & Tablets", TomameCategory.COMPUTERS],
  ["Cell Phones & Accessories", TomameCategory.CELL_PHONES],
  ["Cell Phones & Smartphones", TomameCategory.CELL_PHONES],
  ["TV, Video & Home Audio", TomameCategory.TV_VIDEO],
  ["Cameras & Photo", TomameCategory.CAMERA_PHOTO],
  ["Portable Audio & Headphones", TomameCategory.HEADPHONES],
  ["Video Games & Consoles", TomameCategory.VIDEO_GAMES],
  ["Smart Watches", TomameCategory.WEARABLE_TECHNOLOGY],
  ["Wearable Technology", TomameCategory.WEARABLE_TECHNOLOGY],
  ["Smart Home & Surveillance", TomameCategory.SMART_HOME],
  ["Vehicle Electronics & GPS", TomameCategory.CAR_ELECTRONICS],

  // Home & Garden
  ["Home & Garden", TomameCategory.HOME_KITCHEN],
  ["Furniture", TomameCategory.FURNITURE],
  ["Kitchen, Dining & Bar", TomameCategory.KITCHEN_DINING],
  ["Bedding", TomameCategory.BEDDING],
  ["Bath", TomameCategory.BATH],
  ["Yard, Garden & Outdoor Living", TomameCategory.GARDEN_OUTDOOR],
  ["Major Appliances", TomameCategory.APPLIANCES],
  ["Small Kitchen Appliances", TomameCategory.APPLIANCES],
  ["Tools & Workshop Equipment", TomameCategory.TOOLS],
  ["Home Improvement", TomameCategory.HOME_IMPROVEMENT],
  ["Lamps, Lighting & Ceiling Fans", TomameCategory.LIGHTING],

  // Fashion & Clothing
  ["Clothing, Shoes & Accessories", TomameCategory.FASHION_ACCESSORIES],
  ["Women", TomameCategory.CLOTHING_WOMEN],
  ["Women's Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Men", TomameCategory.CLOTHING_MEN],
  ["Men's Clothing", TomameCategory.CLOTHING_MEN],
  ["Kids' Clothing, Shoes & Accs", TomameCategory.CLOTHING_KIDS],
  ["Baby & Toddler Clothing", TomameCategory.CLOTHING_KIDS],
  ["Women's Shoes", TomameCategory.SHOES_WOMEN],
  ["Men's Shoes", TomameCategory.SHOES_MEN],
  ["Unisex Kids' Shoes", TomameCategory.SHOES_KIDS],
  ["Jewelry & Watches", TomameCategory.JEWELRY],
  ["Fine Jewelry", TomameCategory.JEWELRY],
  ["Fashion Jewelry", TomameCategory.JEWELRY],
  ["Watches, Parts & Accessories", TomameCategory.WATCHES],
  ["Women's Bags & Handbags", TomameCategory.HANDBAGS],
  ["Men's Bags", TomameCategory.HANDBAGS],
  ["Travel", TomameCategory.LUGGAGE],

  // Beauty & Personal Care
  ["Health & Beauty", TomameCategory.BEAUTY],
  ["Skin Care", TomameCategory.SKINCARE],
  ["Makeup", TomameCategory.MAKEUP],
  ["Hair Care & Styling", TomameCategory.HAIRCARE],
  ["Fragrances", TomameCategory.FRAGRANCE],
  ["Bath & Body", TomameCategory.PERSONAL_CARE],

  // Health & Wellness
  ["Vitamins & Lifestyle Supplements", TomameCategory.VITAMINS_SUPPLEMENTS],
  ["Medical, Mobility & Disability", TomameCategory.MEDICAL_SUPPLIES],
  ["Massage", TomameCategory.WELLNESS_RELAXATION],

  // Sports & Outdoors
  ["Sporting Goods", TomameCategory.SPORTS_OUTDOORS],
  ["Exercise & Fitness", TomameCategory.EXERCISE_FITNESS],
  ["Outdoor Sports", TomameCategory.OUTDOOR_RECREATION],
  ["Sports Mem, Cards & Fan Shop", TomameCategory.SPORTS_FAN],
  ["Cycling", TomameCategory.CYCLING],

  // Baby & Kids
  ["Baby", TomameCategory.BABY],
  ["Toys & Hobbies", TomameCategory.TOYS_GAMES],

  // Automotive
  ["eBay Motors", TomameCategory.AUTOMOTIVE],
  ["Parts & Accessories", TomameCategory.AUTOMOTIVE],
  ["Car & Truck Parts & Accessories", TomameCategory.AUTOMOTIVE],
  ["Car Care & Cleaning", TomameCategory.CAR_CARE],

  // Books & Media
  ["Books & Magazines", TomameCategory.BOOKS],
  ["Books", TomameCategory.BOOKS],
  ["Music", TomameCategory.MUSIC],
  ["CDs", TomameCategory.MUSIC],
  ["Records", TomameCategory.MUSIC],
  ["Movies & TV", TomameCategory.MOVIES_TV],
  ["DVDs & Blu-ray Discs", TomameCategory.MOVIES_TV],
  ["Musical Instruments & Gear", TomameCategory.MUSICAL_INSTRUMENTS],

  // Office & School
  ["Business & Industrial", TomameCategory.OFFICE_PRODUCTS],
  ["Office", TomameCategory.OFFICE_PRODUCTS],
  ["Office Equipment & Supplies", TomameCategory.OFFICE_PRODUCTS],
  ["Office Furniture", TomameCategory.OFFICE_FURNITURE],

  // Pet Supplies
  ["Pet Supplies", TomameCategory.PET_SUPPLIES],

  // Arts & Crafts
  ["Crafts", TomameCategory.ARTS_CRAFTS],
  ["Sewing", TomameCategory.CRAFT_SUPPLIES],
  ["Fabric", TomameCategory.FABRIC],
  ["Art Supplies", TomameCategory.ARTS_CRAFTS],

  // Collectibles & Antiques
  ["Collectibles", TomameCategory.COLLECTIBLES],
  ["Antiques", TomameCategory.ANTIQUES],
  ["Sports Memorabilia, Fan Shop & Sports Cards", TomameCategory.SPORTS_COLLECTIBLES],
  ["Entertainment Memorabilia", TomameCategory.COLLECTIBLES],
]);
