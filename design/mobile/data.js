/* Sample data for the design prototype only. The native app reads Tomame's real APIs. */
window.TM = {
  rate: 12.27,
  ratePrev: 12.41,
  taxPct: 0.08875, // US sales tax at the hub
  feePct: 0.05, // value fee
  perLb: 6.5, // freight USD per lb
  boxSavePct: 0.1, // consolidation saving from two lines up
  products: {
    sony: {
      title: "Sony WH-1000XM5 Wireless Noise Canceling Headphones",
      short: "Sony WH-1000XM5",
      store: "Amazon", region: "USA", usd: 328, lb: 2, img: "headphones",
      options: ["Black", "Silver", "Midnight Blue"],
    },
    xbox: {
      title: "Xbox Wireless Controller – Astral Purple",
      short: "Xbox Controller", store: "Amazon", region: "USA", usd: 64.99, lb: 1, img: "video-games",
      options: ["Astral Purple", "Carbon Black", "Robot White"],
    },
    cerave: {
      title: "CeraVe Skin Renewing Night Cream, 1.7 oz",
      short: "CeraVe Night Cream", store: "Walmart", region: "USA", usd: 21.97, lb: 1, img: "skin-care",
    },
    casio: {
      title: "Casio Edifice Chronograph EFR-539D Stainless Steel",
      short: "Casio Edifice", store: "Amazon", region: "USA", usd: 129.99, lb: 1, img: "watches",
    },
    brogue: {
      title: "Florsheim Kenmoor Wingtip Oxford, Cognac",
      short: "Florsheim Wingtip", store: "eBay", region: "USA", usd: 94.95, ship: 9.99, lb: 4, img: "mens-shoes",
    },
    macbook: {
      title: "Apple MacBook Air 13\" M3, 16GB RAM, 256GB",
      short: "MacBook Air M3", store: "Amazon", region: "USA", usd: 899, lb: 4, img: "computers",
    },
    amazfit: {
      title: "Amazfit Bip 5 Smart Watch, GPS, 10-day battery",
      short: "Amazfit Bip 5", store: "Amazon", region: "USA", usd: 69.99, lb: 1, img: "wearable-technology",
    },
    valentino: {
      title: "Valentino Donna Born in Roma Eau de Parfum, 3.4 oz",
      short: "Born in Roma EDP", store: "Amazon", region: "USA", usd: 142, lb: 2, img: "fragrance",
    },
    pumps: {
      title: "Sam Edelman Hazel Pointed-Toe Pump, Nude",
      short: "Sam Edelman Hazel", store: "Walmart", region: "USA", usd: 119.95, lb: 3, img: "womens-shoes",
    },
    brio: {
      title: "BRIO World Railway Starter Set, 26 pieces",
      short: "BRIO Railway Set", store: "Walmart", region: "USA", usd: 49.99, lb: 3, img: "toys-games",
    },
    iphone: {
      title: "Apple iPhone 15, 128GB, Unlocked – Renewed Premium",
      short: "iPhone 15 Renewed", store: "eBay", region: "USA", usd: 489, ship: 0, lb: 1, img: "cell-phones-accessories",
    },
  },
  departments: [
    ["Phones", "cell-phones-accessories"], ["Laptops", "computers"], ["Audio", "headphones"],
    ["Gaming", "video-games"], ["Beauty", "skin-care"], ["Fragrance", "fragrance"],
    ["Shoes", "mens-shoes"], ["Kitchen", "appliances"],
  ],
  stages: [
    { key: "paid", label: "Paid — order confirmed", short: "Paid", icon: "credit-card", when: "22 Nov" },
    { key: "purchased", label: "Purchased from the store", short: "Purchased", icon: "storefront", when: "23 Nov" },
    { key: "hub", label: "Arrived at our US hub", short: "At US hub", icon: "warehouse", when: "23 Nov · 3 lb" },
    { key: "air", label: "In flight to Accra", short: "In the air", icon: "airplane-tilt", when: "Delta Cargo JFK → ACC" },
    { key: "accra", label: "Arrived in Accra — cleared", short: "In Accra", icon: "map-pin-line", when: "Wed 25 Nov" },
    { key: "out", label: "Out for delivery", short: "On the way", icon: "motorcycle", when: "Rider assigned" },
    { key: "door", label: "Delivered", short: "Delivered", icon: "house-line", when: "Sat 28 Nov" },
  ],
};
