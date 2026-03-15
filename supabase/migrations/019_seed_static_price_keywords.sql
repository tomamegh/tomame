-- Migration 019: Seed keywords for existing static_price_list entries
-- Keywords are lowercase fragments matched against the scraped product title.
-- A product matches if ALL keywords for an entry appear in the title.

-- iPhone
UPDATE static_price_list SET keywords = '{iphone,17,pro}' WHERE product_name = 'iPhone 17 Pro & Max';
UPDATE static_price_list SET keywords = '{iphone,17}' WHERE product_name = 'iPhone 17' AND category = 'iPhone';
UPDATE static_price_list SET keywords = '{iphone,17,air}' WHERE product_name = 'iPhone 17 Air';
UPDATE static_price_list SET keywords = '{iphone,16,pro}' WHERE product_name = 'iPhone 16 Pro & Max';
UPDATE static_price_list SET keywords = '{iphone,16}' WHERE product_name = 'iPhone 16' AND category = 'iPhone';
UPDATE static_price_list SET keywords = '{iphone,16e}' WHERE product_name = 'iPhone 16e';
UPDATE static_price_list SET keywords = '{iphone,15,pro}' WHERE product_name = 'iPhone 15 Pro & Max';
UPDATE static_price_list SET keywords = '{iphone,15}' WHERE product_name = 'iPhone 15' AND category = 'iPhone';
UPDATE static_price_list SET keywords = '{iphone,14,pro}' WHERE product_name = 'iPhone 14 Pro & Max';
UPDATE static_price_list SET keywords = '{iphone,14}' WHERE product_name = 'iPhone 14' AND category = 'iPhone';
UPDATE static_price_list SET keywords = '{iphone,13,pro}' WHERE product_name = 'iPhone 13 Pro & Max';
UPDATE static_price_list SET keywords = '{iphone,13}' WHERE product_name = 'iPhone 13 & Mini';
UPDATE static_price_list SET keywords = '{iphone,12,pro}' WHERE product_name = 'iPhone 12 Pro & Max';
UPDATE static_price_list SET keywords = '{iphone,12}' WHERE product_name = 'iPhone 12 & Mini';
UPDATE static_price_list SET keywords = '{iphone,11,pro}' WHERE product_name = 'iPhone 11 Pro Max';
UPDATE static_price_list SET keywords = '{iphone,11}' WHERE product_name = 'iPhone 11' AND category = 'iPhone';
UPDATE static_price_list SET keywords = '{iphone,se}' WHERE product_name = 'iPhone X & SE';

-- Android
UPDATE static_price_list SET keywords = '{android}' WHERE product_name = 'Low End Android';

-- iPad
UPDATE static_price_list SET keywords = '{ipad,pro,13}' WHERE product_name = 'iPad Pro 13" New M4';
UPDATE static_price_list SET keywords = '{ipad,13}' WHERE product_name = 'iPad 13 Inches';
UPDATE static_price_list SET keywords = '{ipad,air,11}' WHERE product_name = 'iPad Air 11" New';
UPDATE static_price_list SET keywords = '{ipad,11}' WHERE product_name = 'iPad 11 Inches';
UPDATE static_price_list SET keywords = '{ipad,pro,12}' WHERE product_name = 'iPad Pro 12"';
UPDATE static_price_list SET keywords = '{ipad,10th}' WHERE product_name = 'iPad 10th Gen';
UPDATE static_price_list SET keywords = '{ipad,mini}' WHERE product_name = 'iPad Mini';

-- Apple Watch
UPDATE static_price_list SET keywords = '{apple,watch,ultra,3}' WHERE product_name = 'Apple Watch Ultra 3';
UPDATE static_price_list SET keywords = '{apple,watch,ultra,2}' WHERE product_name = 'Apple Watch Ultra 2';
UPDATE static_price_list SET keywords = '{apple,watch,series,11}' WHERE product_name = 'Apple Watch Series 11';
UPDATE static_price_list SET keywords = '{apple,watch,series,10}' WHERE product_name = 'Apple Watch Series 10';
UPDATE static_price_list SET keywords = '{apple,watch,series,9}' WHERE product_name = 'Apple Watch Series 9';
UPDATE static_price_list SET keywords = '{apple,watch,series,8}' WHERE product_name = 'Apple Watch Series 8';
UPDATE static_price_list SET keywords = '{apple,watch,series,7}' WHERE product_name = 'Apple Watch Series 7';
UPDATE static_price_list SET keywords = '{apple,watch,series,6}' WHERE product_name = 'Apple Watch Series 6';
UPDATE static_price_list SET keywords = '{apple,watch,series,5}' WHERE product_name = 'Apple Watch Series 5';

-- Mac & Laptops
UPDATE static_price_list SET keywords = '{imac}' WHERE product_name = 'iMac';
UPDATE static_price_list SET keywords = '{macbook,pro,16}' WHERE product_name = 'MacBook Pro 16"';
UPDATE static_price_list SET keywords = '{macbook,pro,14}' WHERE product_name = 'MacBook Pro 14"';
UPDATE static_price_list SET keywords = '{gaming,laptop}' WHERE product_name = 'Laptop Gaming';
UPDATE static_price_list SET keywords = '{macbook,air,15}' WHERE product_name = 'MacBook Air 15"';
UPDATE static_price_list SET keywords = '{laptop}' WHERE product_name = 'Laptop Regular';
UPDATE static_price_list SET keywords = '{chromebook}' WHERE product_name = 'Chromebook';

-- Audio
UPDATE static_price_list SET keywords = '{airpods,max}' WHERE product_name = 'AirPod Max';
UPDATE static_price_list SET keywords = '{jbl,extreme}' WHERE product_name = 'JBL Extreme';
UPDATE static_price_list SET keywords = '{jbl,pulse}' WHERE product_name = 'JBL Pulse';
UPDATE static_price_list SET keywords = '{jbl,charge}' WHERE product_name = 'JBL Charge';
UPDATE static_price_list SET keywords = '{jbl,flip}' WHERE product_name = 'JBL Flip';
UPDATE static_price_list SET keywords = '{homepod}' WHERE product_name = 'HomePod' AND category = 'Audio';
UPDATE static_price_list SET keywords = '{airpods,pro,3}' WHERE product_name = 'AirPod Pro Gen 3';
UPDATE static_price_list SET keywords = '{airpods,3}' WHERE product_name = 'AirPod Gen 3';
UPDATE static_price_list SET keywords = '{beats,pill}' WHERE product_name = 'Beats Pill';
UPDATE static_price_list SET keywords = '{bose,headphone}' WHERE product_name = 'Bose Headphones';
UPDATE static_price_list SET keywords = '{airpods,pro}' WHERE product_name = 'AirPod Pro' AND category = 'Audio';
UPDATE static_price_list SET keywords = '{airpods,2}' WHERE product_name = 'AirPod Gen 2';
UPDATE static_price_list SET keywords = '{beats,studio}' WHERE product_name = 'Beats Studio Headphone';
UPDATE static_price_list SET keywords = '{beats,bud}' WHERE product_name = 'Beats Bud';
UPDATE static_price_list SET keywords = '{bose,soundlink}' WHERE product_name = 'Bose SoundLink';
UPDATE static_price_list SET keywords = '{galaxy,bud}' WHERE product_name = 'Galaxy Bud';
UPDATE static_price_list SET keywords = '{homepod,mini}' WHERE product_name = 'HomePod Mini' AND category = 'Audio';
UPDATE static_price_list SET keywords = '{airpods,1}' WHERE product_name = 'AirPod Gen 1';
UPDATE static_price_list SET keywords = '{jbl,clip}' WHERE product_name = 'JBL Clip';

-- Gaming
UPDATE static_price_list SET keywords = '{ps5}' WHERE product_name = 'PS5 / PS5 Pro';
UPDATE static_price_list SET keywords = '{ps4,pro}' WHERE product_name = 'PS4 Pro';
UPDATE static_price_list SET keywords = '{xbox,series}' WHERE product_name = 'Xbox Series S & X';
UPDATE static_price_list SET keywords = '{ps4}' WHERE product_name = 'PS4' AND category = 'Gaming';
UPDATE static_price_list SET keywords = '{nintendo,switch,oled}' WHERE product_name = 'Nintendo Switch OLED';
UPDATE static_price_list SET keywords = '{steam,vr}' WHERE product_name = 'Steam VR';
UPDATE static_price_list SET keywords = '{meta,quest}' WHERE product_name = 'Meta Quest';
UPDATE static_price_list SET keywords = '{nintendo,switch}' WHERE product_name = 'Nintendo Switch' AND category = 'Gaming';
UPDATE static_price_list SET keywords = '{ps,portal}' WHERE product_name = 'PS Portal';
UPDATE static_price_list SET keywords = '{nintendo,lite}' WHERE product_name = 'Nintendo Lite';
UPDATE static_price_list SET keywords = '{ps5,controller}' WHERE product_name = 'PS Controllers';
UPDATE static_price_list SET keywords = '{ps5,cd}' WHERE product_name = 'PS CDs';

-- Accessories
UPDATE static_price_list SET keywords = '{apple,tv}' WHERE product_name = 'Apple TV';
UPDATE static_price_list SET keywords = '{homepod}' WHERE product_name = 'HomePod' AND category = 'Accessories';
UPDATE static_price_list SET keywords = '{ray,ban,meta}' WHERE product_name = 'Ray Ban Meta';
UPDATE static_price_list SET keywords = '{deeper,connect}' WHERE product_name = 'Deeper Connect';
UPDATE static_price_list SET keywords = '{apple,keyboard}' WHERE product_name = 'Apple Keyboard';
UPDATE static_price_list SET keywords = '{homepod,mini}' WHERE product_name = 'HomePod Mini' AND category = 'Accessories';
UPDATE static_price_list SET keywords = '{fire,hd,kids}' WHERE product_name = 'Fire HD Kids';
UPDATE static_price_list SET keywords = '{apple,pencil}' WHERE product_name = 'Apple Pencil';
UPDATE static_price_list SET keywords = '{magic,mouse}' WHERE product_name = 'Magic Mouse';
UPDATE static_price_list SET keywords = '{airtag}' WHERE product_name = 'AirTag';

-- Watches
UPDATE static_price_list SET keywords = '{luxury,watch}' WHERE product_name = 'Luxury Watch';
UPDATE static_price_list SET keywords = '{smart,watch}' WHERE product_name = 'Smart Watch';
UPDATE static_price_list SET keywords = '{watch}' WHERE product_name = 'Regular Watch';

-- Fragrance
UPDATE static_price_list SET keywords = '{niche,perfume}' WHERE product_name = 'Niche Perfumes';
UPDATE static_price_list SET keywords = '{perfume}' WHERE product_name = 'Regular Perfumes';

-- Automotive
UPDATE static_price_list SET keywords = '{headlight}' WHERE product_name = 'Car Headlights';
UPDATE static_price_list SET keywords = '{tail,light}' WHERE product_name = 'Car Tail Lights';
