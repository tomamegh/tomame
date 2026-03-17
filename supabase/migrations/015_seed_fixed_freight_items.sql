-- Seed fixed freight items from Awa Technologies price list
-- Keywords are lowercase for case-insensitive matching against scraped product names

INSERT INTO fixed_freight_items (category, product_name, freight_rate_ghs, keywords, sort_order) VALUES

-- IPHONE
('IPHONE', 'iPhone 17 Pro & Max', 1800, ARRAY['iphone 17 pro', 'iphone 17 pro max', 'iphone 17 max'], 1),
('IPHONE', 'iPhone 17', 1600, ARRAY['iphone 17'], 2),
('IPHONE', 'iPhone 17 Air', 1300, ARRAY['iphone 17 air'], 3),
('IPHONE', 'iPhone 16 Pro & Max', 1600, ARRAY['iphone 16 pro', 'iphone 16 pro max', 'iphone 16 max'], 4),
('IPHONE', 'iPhone 16', 1400, ARRAY['iphone 16'], 5),
('IPHONE', 'iPhone 16e', 1000, ARRAY['iphone 16e'], 6),
('IPHONE', 'iPhone 15 Pro & Max', 1000, ARRAY['iphone 15 pro', 'iphone 15 pro max', 'iphone 15 max'], 7),
('IPHONE', 'iPhone 15', 900, ARRAY['iphone 15'], 8),
('IPHONE', 'iPhone 14 Pro & Max', 900, ARRAY['iphone 14 pro', 'iphone 14 pro max', 'iphone 14 max'], 9),
('IPHONE', 'iPhone 14', 800, ARRAY['iphone 14'], 10),
('IPHONE', 'iPhone 13 Pro & Max', 850, ARRAY['iphone 13 pro', 'iphone 13 pro max', 'iphone 13 max'], 11),
('IPHONE', 'iPhone 13 & Mini', 500, ARRAY['iphone 13', 'iphone 13 mini'], 12),
('IPHONE', 'iPhone 12 Pro & Max', 750, ARRAY['iphone 12 pro', 'iphone 12 pro max', 'iphone 12 max'], 13),
('IPHONE', 'iPhone 12 & Mini', 500, ARRAY['iphone 12', 'iphone 12 mini'], 14),
('IPHONE', 'iPhone 11 Pro Max', 550, ARRAY['iphone 11 pro', 'iphone 11 pro max'], 15),
('IPHONE', 'iPhone 11', 500, ARRAY['iphone 11'], 16),
('IPHONE', 'iPhone X & SE', 450, ARRAY['iphone x', 'iphone se', 'iphone xs', 'iphone xr', 'iphone xs max'], 17),

-- ANDROID
('ANDROID', 'Low End Android', 300, ARRAY['android', 'samsung galaxy a', 'redmi', 'poco', 'realme', 'motorola moto g', 'nokia'], 1),

-- IPAD
('IPAD', 'iPad Pro 13" M4', 1300, ARRAY['ipad pro 13', 'ipad pro m4'], 1),
('IPAD', 'iPad 13 Inches', 1250, ARRAY['ipad 13 inch', 'ipad 13"'], 2),
('IPAD', 'iPad Air 11"', 1100, ARRAY['ipad air 11', 'ipad air m2', 'ipad air m3'], 3),
('IPAD', 'iPad 11 Inches', 1150, ARRAY['ipad 11 inch', 'ipad 11"'], 4),
('IPAD', 'iPad Pro 12"', 950, ARRAY['ipad pro 12', 'ipad pro m2', 'ipad pro m1'], 5),
('IPAD', 'iPad 10th Gen', 700, ARRAY['ipad 10th', 'ipad 10'], 6),
('IPAD', 'iPad Mini', 600, ARRAY['ipad mini'], 7),

-- APPLE WATCH
('APPLE WATCH', 'Apple Watch Ultra 3', 800, ARRAY['apple watch ultra 3'], 1),
('APPLE WATCH', 'Apple Watch Ultra 2', 750, ARRAY['apple watch ultra 2', 'apple watch ultra'], 2),
('APPLE WATCH', 'Apple Watch Series 11', 750, ARRAY['apple watch series 11', 'apple watch 11'], 3),
('APPLE WATCH', 'Apple Watch Series 10', 700, ARRAY['apple watch series 10', 'apple watch 10'], 4),
('APPLE WATCH', 'Apple Watch Series 9', 500, ARRAY['apple watch series 9', 'apple watch 9'], 5),
('APPLE WATCH', 'Apple Watch Series 8', 450, ARRAY['apple watch series 8', 'apple watch 8'], 6),
('APPLE WATCH', 'Apple Watch Series 7', 450, ARRAY['apple watch series 7', 'apple watch 7'], 7),
('APPLE WATCH', 'Apple Watch Series 6', 400, ARRAY['apple watch series 6', 'apple watch 6'], 8),
('APPLE WATCH', 'Apple Watch Series 5', 300, ARRAY['apple watch series 5', 'apple watch 5'], 9),

-- MAC & LAPTOPS
('MAC & LAPTOPS', 'iMac', 2500, ARRAY['imac'], 1),
('MAC & LAPTOPS', 'MacBook Pro 16"', 1500, ARRAY['macbook pro 16', 'macbook pro 16 inch'], 2),
('MAC & LAPTOPS', 'MacBook Pro 14"', 1400, ARRAY['macbook pro 14', 'macbook pro 14 inch', 'macbook pro m4', 'macbook pro m3'], 3),
('MAC & LAPTOPS', 'Laptop Gaming', 1500, ARRAY['gaming laptop', 'rog', 'alienware', 'razer blade', 'legion', 'omen', 'predator'], 4),
('MAC & LAPTOPS', 'MacBook Air 15"', 1300, ARRAY['macbook air 15', 'macbook air 15 inch'], 5),
('MAC & LAPTOPS', 'Laptop Regular', 1100, ARRAY['laptop', 'thinkpad', 'dell xps', 'hp pavilion', 'hp envy', 'surface laptop'], 6),
('MAC & LAPTOPS', 'Chromebook', 800, ARRAY['chromebook'], 7),

-- AUDIO
('AUDIO', 'AirPods Max', 600, ARRAY['airpods max', 'airpod max'], 1),
('AUDIO', 'JBL Extreme', 500, ARRAY['jbl extreme', 'jbl xtreme'], 2),
('AUDIO', 'JBL Pulse', 400, ARRAY['jbl pulse'], 3),
('AUDIO', 'JBL Charge', 380, ARRAY['jbl charge'], 4),
('AUDIO', 'JBL Flip', 350, ARRAY['jbl flip'], 5),
('AUDIO', 'HomePod', 350, ARRAY['homepod'], 6),
('AUDIO', 'AirPods Pro Gen 3', 300, ARRAY['airpods pro 3', 'airpod pro 3', 'airpods pro gen 3'], 7),
('AUDIO', 'AirPods Gen 3', 300, ARRAY['airpods 3', 'airpod 3', 'airpods gen 3', 'airpods 3rd'], 8),
('AUDIO', 'Beats Pill', 300, ARRAY['beats pill'], 9),
('AUDIO', 'Bose Headphones', 300, ARRAY['bose headphones', 'bose quietcomfort', 'bose qc', 'bose 700', 'bose nc'], 10),
('AUDIO', 'AirPods Pro', 250, ARRAY['airpods pro', 'airpod pro'], 11),
('AUDIO', 'AirPods Gen 2', 250, ARRAY['airpods 2', 'airpod 2', 'airpods gen 2', 'airpods 2nd'], 12),
('AUDIO', 'Beats Studio Headphone', 250, ARRAY['beats studio', 'beats headphone'], 13),
('AUDIO', 'Beats Buds', 250, ARRAY['beats bud', 'beats fit', 'beats studio buds'], 14),
('AUDIO', 'Bose SoundLink', 250, ARRAY['bose soundlink', 'bose speaker'], 15),
('AUDIO', 'Galaxy Buds', 250, ARRAY['galaxy bud', 'galaxy buds'], 16),
('AUDIO', 'HomePod Mini', 200, ARRAY['homepod mini'], 17),
('AUDIO', 'AirPods Gen 1', 150, ARRAY['airpods 1', 'airpod 1', 'airpods gen 1', 'airpods 1st'], 18),
('AUDIO', 'JBL Clip', 100, ARRAY['jbl clip'], 19),

-- GAMING
('GAMING', 'PS5 / PS5 Pro', 1500, ARRAY['ps5', 'playstation 5', 'ps5 pro'], 1),
('GAMING', 'PS4 Pro', 1100, ARRAY['ps4 pro'], 2),
('GAMING', 'Xbox Series S & X', 1100, ARRAY['xbox series', 'xbox series s', 'xbox series x'], 3),
('GAMING', 'PS4', 1000, ARRAY['ps4', 'playstation 4'], 4),
('GAMING', 'Nintendo Switch OLED', 650, ARRAY['nintendo switch oled', 'switch oled'], 5),
('GAMING', 'Steam VR', 600, ARRAY['steam vr', 'valve index', 'steam deck'], 6),
('GAMING', 'Meta Quest', 500, ARRAY['meta quest', 'oculus quest', 'quest 3', 'quest 2'], 7),
('GAMING', 'Nintendo Switch', 500, ARRAY['nintendo switch'], 8),
('GAMING', 'PS Portal', 400, ARRAY['ps portal', 'playstation portal'], 9),
('GAMING', 'Nintendo Lite', 200, ARRAY['nintendo lite', 'switch lite'], 10),
('GAMING', 'PS Controllers', 150, ARRAY['ps5 controller', 'ps4 controller', 'dualsense', 'dualshock', 'xbox controller'], 11),
('GAMING', 'PS CDs', 50, ARRAY['ps5 game', 'ps4 game', 'playstation game', 'xbox game', 'nintendo game'], 12),

-- ACCESSORIES
('ACCESSORIES', 'Apple TV', 370, ARRAY['apple tv'], 1),
('ACCESSORIES', 'Ray-Ban Meta', 350, ARRAY['ray-ban meta', 'ray ban meta', 'rayban meta'], 3),
('ACCESSORIES', 'Deeper Connect', 350, ARRAY['deeper connect'], 4),
('ACCESSORIES', 'Apple Keyboard', 300, ARRAY['apple keyboard', 'magic keyboard'], 5),
('ACCESSORIES', 'Fire HD Kids', 150, ARRAY['fire hd kids', 'fire hd', 'kindle fire'], 7),
('ACCESSORIES', 'Apple Pencil', 100, ARRAY['apple pencil'], 8),
('ACCESSORIES', 'Magic Mouse', 100, ARRAY['magic mouse'], 9),
('ACCESSORIES', 'AirTag', 50, ARRAY['airtag', 'air tag'], 10),

-- WATCHES
('WATCHES', 'Luxury Watch', 300, ARRAY['rolex', 'omega', 'tag heuer', 'breitling', 'cartier', 'luxury watch'], 1),
('WATCHES', 'Smart Watch', 150, ARRAY['smart watch', 'smartwatch', 'fitbit', 'garmin', 'samsung watch', 'galaxy watch'], 2),
('WATCHES', 'Regular Watch', 100, ARRAY['watch', 'casio', 'timex', 'seiko', 'citizen', 'fossil'], 3),

-- FRAGRANCE
('FRAGRANCE', 'Niche Perfumes', 250, ARRAY['tom ford', 'creed', 'maison francis', 'le labo', 'byredo', 'niche perfume', 'niche fragrance'], 1),
('FRAGRANCE', 'Regular Perfumes', 150, ARRAY['perfume', 'cologne', 'eau de', 'fragrance', 'dior', 'chanel', 'gucci', 'versace', 'ysl'], 2),

-- AUTOMOTIVE
('AUTOMOTIVE', 'Car Headlights', 200, ARRAY['headlight', 'head light', 'headlamp'], 1),
('AUTOMOTIVE', 'Car Tail Lights', 120, ARRAY['tail light', 'taillight', 'tail lamp', 'taillamp'], 2);
