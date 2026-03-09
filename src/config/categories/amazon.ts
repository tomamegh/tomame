import { TomameCategory } from "./tomame_category";

// Amazon category strings mapped to Tomame categories
export const AMAZON_CATEGORY_MAP = new Map<string, TomameCategory>([
  // Electronics & Computers
  ["Electronics", TomameCategory.ELECTRONICS],
  ["Computers", TomameCategory.COMPUTERS],
  ["Cell Phones & Accessories", TomameCategory.CELL_PHONES],
  ["TV & Video", TomameCategory.TV_VIDEO],
  ["Camera & Photo", TomameCategory.CAMERA_PHOTO],
  ["Headphones", TomameCategory.HEADPHONES],
  ["Video Games", TomameCategory.VIDEO_GAMES],
  ["Wearable Technology", TomameCategory.WEARABLE_TECHNOLOGY],
  ["Smart Home", TomameCategory.SMART_HOME],
  ["Amazon Devices & Accessories", TomameCategory.ELECTRONICS],
  ["Portable Audio & Accessories", TomameCategory.HEADPHONES],
  ["Car & Vehicle Electronics", TomameCategory.CAR_ELECTRONICS],

  // Home & Garden
  ["Home & Kitchen", TomameCategory.HOME_KITCHEN],
  ["Furniture", TomameCategory.FURNITURE],
  ["Kitchen & Dining", TomameCategory.KITCHEN_DINING],
  ["Bedding", TomameCategory.BEDDING],
  ["Bath", TomameCategory.BATH],
  ["Garden & Outdoor", TomameCategory.GARDEN_OUTDOOR],
  ["Patio, Lawn & Garden", TomameCategory.GARDEN_OUTDOOR],
  ["Appliances", TomameCategory.APPLIANCES],
  ["Home Improvement", TomameCategory.HOME_IMPROVEMENT],
  ["Tools & Home Improvement", TomameCategory.TOOLS],
  ["Lighting & Ceiling Fans", TomameCategory.LIGHTING],
  ["Amazon Home", TomameCategory.HOME_KITCHEN],

  // Fashion & Clothing
  ["Women's Fashion", TomameCategory.CLOTHING_WOMEN],
  ["Women's Clothing", TomameCategory.CLOTHING_WOMEN],
  ["Men's Fashion", TomameCategory.CLOTHING_MEN],
  ["Men's Clothing", TomameCategory.CLOTHING_MEN],
  ["Girls' Fashion", TomameCategory.CLOTHING_KIDS],
  ["Boys' Fashion", TomameCategory.CLOTHING_KIDS],
  ["Kids' Fashion", TomameCategory.CLOTHING_KIDS],
  ["Women's Shoes", TomameCategory.SHOES_WOMEN],
  ["Men's Shoes", TomameCategory.SHOES_MEN],
  ["Girls' Shoes", TomameCategory.SHOES_KIDS],
  ["Boys' Shoes", TomameCategory.SHOES_KIDS],
  ["Jewelry", TomameCategory.JEWELRY],
  ["Watches", TomameCategory.WATCHES],
  ["Handbags & Wallets", TomameCategory.HANDBAGS],
  ["Luggage & Travel Gear", TomameCategory.LUGGAGE],
  ["Fashion", TomameCategory.FASHION_ACCESSORIES],

  // Beauty & Personal Care
  ["Beauty & Personal Care", TomameCategory.BEAUTY],
  ["Skin Care", TomameCategory.SKINCARE],
  ["Makeup", TomameCategory.MAKEUP],
  ["Hair Care", TomameCategory.HAIRCARE],
  ["Fragrance", TomameCategory.FRAGRANCE],
  ["Personal Care", TomameCategory.PERSONAL_CARE],
  ["Premium Beauty", TomameCategory.BEAUTY],
  ["Luxury Beauty", TomameCategory.BEAUTY],

  // Health & Wellness
  ["Health & Household", TomameCategory.HEALTH_HOUSEHOLD],
  ["Health, Household & Baby Care", TomameCategory.HEALTH_HOUSEHOLD],
  ["Vitamins & Dietary Supplements", TomameCategory.VITAMINS_SUPPLEMENTS],
  ["Medical Supplies & Equipment", TomameCategory.MEDICAL_SUPPLIES],
  ["Wellness & Relaxation", TomameCategory.WELLNESS_RELAXATION],

  // Sports & Outdoors
  ["Sports & Outdoors", TomameCategory.SPORTS_OUTDOORS],
  ["Exercise & Fitness", TomameCategory.EXERCISE_FITNESS],
  ["Outdoor Recreation", TomameCategory.OUTDOOR_RECREATION],
  ["Sports Fan Shop", TomameCategory.SPORTS_FAN],
  ["Hunting & Fishing", TomameCategory.HUNTING_FISHING],
  ["Cycling", TomameCategory.CYCLING],

  // Baby & Kids
  ["Baby", TomameCategory.BABY],
  ["Baby Products", TomameCategory.BABY],
  ["Toys & Games", TomameCategory.TOYS_GAMES],

  // Automotive
  ["Automotive", TomameCategory.AUTOMOTIVE],
  ["Automotive Parts & Accessories", TomameCategory.AUTOMOTIVE],
  ["Car Care", TomameCategory.CAR_CARE],
  ["Car Electronics & Accessories", TomameCategory.CAR_ELECTRONICS],
  ["Motorcycle & Powersports", TomameCategory.MOTORCYCLE],
  ["Tires & Wheels", TomameCategory.TIRES_WHEELS],

  // Books & Media
  ["Books", TomameCategory.BOOKS],
  ["Kindle Store", TomameCategory.KINDLE_EBOOKS],
  ["Kindle eBooks", TomameCategory.KINDLE_EBOOKS],
  ["Audible Books & Originals", TomameCategory.AUDIBLE],
  ["Audible Audiobooks", TomameCategory.AUDIBLE],
  ["Music", TomameCategory.MUSIC],
  ["CDs & Vinyl", TomameCategory.MUSIC],
  ["Digital Music", TomameCategory.MUSIC],
  ["Movies & TV", TomameCategory.MOVIES_TV],
  ["Prime Video", TomameCategory.MOVIES_TV],
  ["Musical Instruments", TomameCategory.MUSICAL_INSTRUMENTS],

  // Office & School
  ["Office Products", TomameCategory.OFFICE_PRODUCTS],
  ["Office & School Supplies", TomameCategory.OFFICE_PRODUCTS],
  ["Office Electronics", TomameCategory.OFFICE_ELECTRONICS],
  ["School Supplies", TomameCategory.SCHOOL_SUPPLIES],
  ["Office Furniture & Lighting", TomameCategory.OFFICE_FURNITURE],

  // Pet Supplies
  ["Pet Supplies", TomameCategory.PET_SUPPLIES],
  ["Dogs", TomameCategory.DOG_SUPPLIES],
  ["Cats", TomameCategory.CAT_SUPPLIES],
  ["Fish & Aquatic Pets", TomameCategory.FISH_AQUATIC],
  ["Birds", TomameCategory.BIRD_SUPPLIES],

  // Food & Grocery
  ["Grocery & Gourmet Food", TomameCategory.GROCERY],
  ["Grocery", TomameCategory.GROCERY],
  ["Snacks & Sweets", TomameCategory.SNACKS],
  ["Beverages", TomameCategory.BEVERAGES],
  ["Prime Pantry", TomameCategory.GROCERY],
  ["Amazon Fresh", TomameCategory.GROCERY],
  ["Whole Foods Market", TomameCategory.GROCERY],

  // Industrial & Scientific
  ["Industrial & Scientific", TomameCategory.INDUSTRIAL_SCIENTIFIC],
  ["Lab & Scientific Products", TomameCategory.LAB_SCIENTIFIC],
  ["Janitorial & Sanitation Supplies", TomameCategory.JANITORIAL],

  // Arts & Crafts
  ["Arts, Crafts & Sewing", TomameCategory.ARTS_CRAFTS],
  ["Craft Supplies", TomameCategory.CRAFT_SUPPLIES],
  ["Fabric", TomameCategory.FABRIC],
  ["Scrapbooking & Stamping", TomameCategory.SCRAPBOOKING],
  ["Knitting & Crochet", TomameCategory.KNITTING_CROCHET],
  ["Beading & Jewelry Making", TomameCategory.BEADING_JEWELRY_MAKING],
  ["Painting, Drawing & Art Supplies", TomameCategory.PAINTING_DRAWING],

  // Collectibles & Memorabilia
  ["Collectibles & Fine Art", TomameCategory.COLLECTIBLES],
  ["Antiques", TomameCategory.ANTIQUES],
  ["Coins & Currency", TomameCategory.COINS_CURRENCY],
  ["Sports Collectibles", TomameCategory.SPORTS_COLLECTIBLES],
  ["Entertainment Collectibles", TomameCategory.COLLECTIBLES],

  // Software
  ["Software", TomameCategory.SOFTWARE],
  ["Apps & Games", TomameCategory.SOFTWARE],

  // Gift Cards
  ["Gift Cards", TomameCategory.GIFT_CARDS],
  ["Amazon Gift Cards", TomameCategory.GIFT_CARDS],

  // Amazon-specific categories
  ["Amazon Basics", TomameCategory.OTHER],
  ["Amazon Renewed", TomameCategory.OTHER],
  ["Amazon Warehouse", TomameCategory.OTHER],
  ["Best Sellers", TomameCategory.OTHER],
  ["New Releases", TomameCategory.OTHER],
  ["Today's Deals", TomameCategory.OTHER],
  ["Customer Service", TomameCategory.OTHER],
  ["Sell", TomameCategory.OTHER],
]);
