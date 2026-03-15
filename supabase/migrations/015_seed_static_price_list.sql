-- Migration 015: Seed static_price_list with Awa Technologies official price list
-- Effective March 2026 — all prices in GHS

INSERT INTO static_price_list (category, product_name, price_ghs, price_min_ghs, price_max_ghs, sort_order) VALUES
  -- IPHONE
  ('iPhone', 'iPhone 17 Pro & Max', 1800, NULL, NULL, 1),
  ('iPhone', 'iPhone 17', 1600, NULL, NULL, 2),
  ('iPhone', 'iPhone 17 Air', 1300, NULL, NULL, 3),
  ('iPhone', 'iPhone 16 Pro & Max', 1600, NULL, NULL, 4),
  ('iPhone', 'iPhone 16', 1400, NULL, NULL, 5),
  ('iPhone', 'iPhone 16e', 1000, NULL, NULL, 6),
  ('iPhone', 'iPhone 15 Pro & Max', 1000, NULL, NULL, 7),
  ('iPhone', 'iPhone 15', 900, NULL, NULL, 8),
  ('iPhone', 'iPhone 14 Pro & Max', 900, NULL, NULL, 9),
  ('iPhone', 'iPhone 14', 800, NULL, NULL, 10),
  ('iPhone', 'iPhone 13 Pro & Max', 850, NULL, NULL, 11),
  ('iPhone', 'iPhone 13 & Mini', 500, NULL, NULL, 12),
  ('iPhone', 'iPhone 12 Pro & Max', 750, NULL, NULL, 13),
  ('iPhone', 'iPhone 12 & Mini', 500, NULL, NULL, 14),
  ('iPhone', 'iPhone 11 Pro Max', 550, NULL, NULL, 15),
  ('iPhone', 'iPhone 11', 500, NULL, NULL, 16),
  ('iPhone', 'iPhone X & SE', 450, NULL, NULL, 17),

  -- ANDROID
  ('Android', 'Low End Android', 300, NULL, NULL, 1),

  -- IPAD
  ('iPad', 'iPad Pro 13" New M4', 1300, NULL, NULL, 1),
  ('iPad', 'iPad 13 Inches', 1250, NULL, NULL, 2),
  ('iPad', 'iPad Air 11" New', 1100, NULL, NULL, 3),
  ('iPad', 'iPad 11 Inches', 1150, NULL, NULL, 4),
  ('iPad', 'iPad Pro 12"', 950, NULL, NULL, 5),
  ('iPad', 'iPad 10th Gen', 700, NULL, NULL, 6),
  ('iPad', 'iPad Mini', 600, NULL, NULL, 7),

  -- APPLE WATCH
  ('Apple Watch', 'Apple Watch Ultra 3', 800, NULL, NULL, 1),
  ('Apple Watch', 'Apple Watch Ultra 2', 750, NULL, NULL, 2),
  ('Apple Watch', 'Apple Watch Series 11', 750, NULL, NULL, 3),
  ('Apple Watch', 'Apple Watch Series 10', 700, NULL, NULL, 4),
  ('Apple Watch', 'Apple Watch Series 9', 500, NULL, NULL, 5),
  ('Apple Watch', 'Apple Watch Series 8', 450, NULL, NULL, 6),
  ('Apple Watch', 'Apple Watch Series 7', 450, NULL, NULL, 7),
  ('Apple Watch', 'Apple Watch Series 6', 400, NULL, NULL, 8),
  ('Apple Watch', 'Apple Watch Series 5', 300, NULL, NULL, 9),

  -- MAC & LAPTOPS
  ('Mac & Laptops', 'iMac', 2500, NULL, NULL, 1),
  ('Mac & Laptops', 'MacBook Pro 16"', 1500, NULL, NULL, 2),
  ('Mac & Laptops', 'MacBook Pro 14"', 1400, NULL, NULL, 3),
  ('Mac & Laptops', 'Laptop Gaming', 1400, 1400, 1500, 4),
  ('Mac & Laptops', 'MacBook Air 15"', 1300, NULL, NULL, 5),
  ('Mac & Laptops', 'Laptop Regular', 1100, NULL, NULL, 6),
  ('Mac & Laptops', 'Chromebook', 700, 600, 800, 7),

  -- AUDIO
  ('Audio', 'AirPod Max', 600, NULL, NULL, 1),
  ('Audio', 'JBL Extreme', 500, NULL, NULL, 2),
  ('Audio', 'JBL Pulse', 400, NULL, NULL, 3),
  ('Audio', 'JBL Charge', 380, NULL, NULL, 4),
  ('Audio', 'JBL Flip', 350, NULL, NULL, 5),
  ('Audio', 'HomePod', 350, NULL, NULL, 6),
  ('Audio', 'AirPod Pro Gen 3', 300, NULL, NULL, 7),
  ('Audio', 'AirPod Gen 3', 300, NULL, NULL, 8),
  ('Audio', 'Beats Pill', 300, NULL, NULL, 9),
  ('Audio', 'Bose Headphones', 300, NULL, NULL, 10),
  ('Audio', 'AirPod Pro', 250, NULL, NULL, 11),
  ('Audio', 'AirPod Gen 2', 250, NULL, NULL, 12),
  ('Audio', 'Beats Studio Headphone', 250, NULL, NULL, 13),
  ('Audio', 'Beats Bud', 250, NULL, NULL, 14),
  ('Audio', 'Bose SoundLink', 250, NULL, NULL, 15),
  ('Audio', 'Galaxy Bud', 250, NULL, NULL, 16),
  ('Audio', 'HomePod Mini', 200, NULL, NULL, 17),
  ('Audio', 'AirPod Gen 1', 150, NULL, NULL, 18),
  ('Audio', 'JBL Clip', 100, NULL, NULL, 19),

  -- GAMING
  ('Gaming', 'PS5 / PS5 Pro', 1375, 1250, 1500, 1),
  ('Gaming', 'PS4 Pro', 1100, NULL, NULL, 2),
  ('Gaming', 'Xbox Series S & X', 1100, NULL, NULL, 3),
  ('Gaming', 'PS4', 1000, NULL, NULL, 4),
  ('Gaming', 'Nintendo Switch OLED', 650, NULL, NULL, 5),
  ('Gaming', 'Steam VR', 600, NULL, NULL, 6),
  ('Gaming', 'Meta Quest', 500, NULL, NULL, 7),
  ('Gaming', 'Nintendo Switch', 500, NULL, NULL, 8),
  ('Gaming', 'PS Portal', 400, NULL, NULL, 9),
  ('Gaming', 'Nintendo Lite', 200, NULL, NULL, 10),
  ('Gaming', 'PS Controllers', 150, NULL, NULL, 11),
  ('Gaming', 'PS CDs', 50, NULL, NULL, 12),

  -- ACCESSORIES
  ('Accessories', 'Apple TV', 370, NULL, NULL, 1),
  ('Accessories', 'HomePod', 350, NULL, NULL, 2),
  ('Accessories', 'Ray Ban Meta', 350, NULL, NULL, 3),
  ('Accessories', 'Deeper Connect', 350, NULL, NULL, 4),
  ('Accessories', 'Apple Keyboard', 300, NULL, NULL, 5),
  ('Accessories', 'HomePod Mini', 200, NULL, NULL, 6),
  ('Accessories', 'Fire HD Kids', 150, NULL, NULL, 7),
  ('Accessories', 'Apple Pencil', 100, NULL, NULL, 8),
  ('Accessories', 'Magic Mouse', 100, NULL, NULL, 9),
  ('Accessories', 'AirTag', 50, NULL, NULL, 10),

  -- WATCHES
  ('Watches', 'Luxury Watch', 300, NULL, NULL, 1),
  ('Watches', 'Smart Watch', 150, NULL, NULL, 2),
  ('Watches', 'Regular Watch', 100, NULL, NULL, 3),

  -- FRAGRANCE
  ('Fragrance', 'Niche Perfumes', 250, NULL, NULL, 1),
  ('Fragrance', 'Regular Perfumes', 150, NULL, NULL, 2),

  -- AUTOMOTIVE
  ('Automotive', 'Car Headlights', 200, NULL, NULL, 1),
  ('Automotive', 'Car Tail Lights', 120, NULL, NULL, 2)

ON CONFLICT DO NOTHING;
