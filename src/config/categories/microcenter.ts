import { TomameCategory } from "./tomame_category";

// Micro Center sells primarily electronics/computers/tech.
// Map their top-level and common sub-categories to TomameCategory.
export const MICROCENTER_CATEGORY_MAP = new Map<string, TomameCategory>([
  // Electronics & Computers
  ["Electronics", TomameCategory.ELECTRONICS],
  ["Computers", TomameCategory.COMPUTERS],
  ["Laptops", TomameCategory.COMPUTERS],
  ["Desktops", TomameCategory.COMPUTERS],
  ["Tablets & eReaders", TomameCategory.COMPUTERS],
  ["Chromebooks", TomameCategory.COMPUTERS],
  ["Gaming Laptops", TomameCategory.COMPUTERS],
  ["Workstations", TomameCategory.COMPUTERS],
  ["Cell Phones", TomameCategory.CELL_PHONES],
  ["Cell Phones & Accessories", TomameCategory.CELL_PHONES],
  ["Unlocked Cell Phones", TomameCategory.CELL_PHONES],
  ["Televisions & Home Theater", TomameCategory.TV_VIDEO],
  ["Televisions", TomameCategory.TV_VIDEO],
  ["Home Theater", TomameCategory.TV_VIDEO],
  ["Cameras & Camcorders", TomameCategory.CAMERA_PHOTO],
  ["Digital Cameras", TomameCategory.CAMERA_PHOTO],
  ["Headphones & Earbuds", TomameCategory.HEADPHONES],
  ["Headphones", TomameCategory.HEADPHONES],
  ["Audio", TomameCategory.HEADPHONES],
  ["Video Games", TomameCategory.VIDEO_GAMES],
  ["PC Gaming", TomameCategory.VIDEO_GAMES],
  ["Console Gaming", TomameCategory.VIDEO_GAMES],
  ["Wearable Tech", TomameCategory.WEARABLE_TECHNOLOGY],
  ["Smart Watches", TomameCategory.WEARABLE_TECHNOLOGY],
  ["Smart Home", TomameCategory.SMART_HOME],
  ["Home Automation", TomameCategory.SMART_HOME],
  ["Security & Home Automation", TomameCategory.SMART_HOME],
  ["Personal Security Products", TomameCategory.SMART_HOME],

  // Computer components & peripherals (primary Micro Center focus)
  ["Components", TomameCategory.COMPUTERS],
  ["CPUs / Processors", TomameCategory.COMPUTERS],
  ["Motherboards", TomameCategory.COMPUTERS],
  ["Graphics Cards", TomameCategory.COMPUTERS],
  ["Video Cards", TomameCategory.COMPUTERS],
  ["Memory", TomameCategory.COMPUTERS],
  ["RAM", TomameCategory.COMPUTERS],
  ["Hard Drives", TomameCategory.COMPUTERS],
  ["Solid State Drives", TomameCategory.COMPUTERS],
  ["Storage", TomameCategory.COMPUTERS],
  ["Power Supplies", TomameCategory.COMPUTERS],
  ["Cases", TomameCategory.COMPUTERS],
  ["Cooling", TomameCategory.COMPUTERS],
  ["PC Peripherals", TomameCategory.COMPUTERS],
  ["Monitors", TomameCategory.COMPUTERS],
  ["Keyboards", TomameCategory.COMPUTERS],
  ["Mice", TomameCategory.COMPUTERS],

  // Office & School
  ["Office", TomameCategory.OFFICE_PRODUCTS],
  ["Office Supplies", TomameCategory.OFFICE_PRODUCTS],
  ["Office Electronics", TomameCategory.OFFICE_ELECTRONICS],
  ["Printers & Scanners", TomameCategory.OFFICE_ELECTRONICS],
  ["Printers", TomameCategory.OFFICE_ELECTRONICS],

  // Networking (often stand-alone at Micro Center, but lumped with electronics here)
  ["Networking", TomameCategory.ELECTRONICS],
  ["Routers", TomameCategory.ELECTRONICS],
  ["Modems", TomameCategory.ELECTRONICS],

  // Home / Appliances (small section at Micro Center)
  ["Appliances", TomameCategory.APPLIANCES],
  ["Small Appliances", TomameCategory.APPLIANCES],
  ["Home & Kitchen", TomameCategory.HOME_KITCHEN],

  // Movies, music, books (rare at Micro Center but possible)
  ["Movies & TV", TomameCategory.MOVIES_TV],
  ["Music", TomameCategory.MUSIC],
  ["Books", TomameCategory.BOOKS],

  // Toys & Hobbies / 3D printing
  ["Toys & Collectibles", TomameCategory.TOYS_GAMES],
  ["3D Printing", TomameCategory.ELECTRONICS],
  ["Drones", TomameCategory.ELECTRONICS],
]);
