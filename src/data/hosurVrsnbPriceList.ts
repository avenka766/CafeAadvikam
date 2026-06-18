export interface HosurDiscountRule {
  /** Human-readable label e.g. "Puffs Item", "Other Item", "Opt" */
  label: string;
  /** Discount percentage e.g. 15 for 15% */
  discountPercent: number;
}

export interface HosurImportedShopPrice {
  itemName: string;
  unitPrice: number;
}

export interface HosurImportedShop {
  shopName: string;
  whatsappNumber: string;
  items: HosurImportedShopPrice[];
  /** Optional discount rules for this shop */
  discounts?: HosurDiscountRule[];
}

export const HOSUR_VRSNB_PRICE_LIST: HosurImportedShop[] = [
  {
    shopName: 'Shree Skanda Villas',
    whatsappNumber: '9626289603',
    items: [
      { itemName: 'Veg Puff', unitPrice: 17 },
      { itemName: 'Egg Puff (Full)', unitPrice: 30 },
    ],
    discounts: [
      { label: 'Puffs Item', discountPercent: 15 },
      { label: 'Other Item', discountPercent: 18 },
      { label: 'Opt', discountPercent: 10 },
    ],
  },
  {
    shopName: 'Lakshmi Foods',
    whatsappNumber: '9342331261',
    items: [
      { itemName: 'Veg Puff', unitPrice: 17 },
      { itemName: 'Egg Puff (Half)', unitPrice: 20 },
      { itemName: 'Cova Bun', unitPrice: 40 },
      { itemName: 'Black Forest', unitPrice: 45 },
      { itemName: 'Brownie Cake', unitPrice: 40 },
      { itemName: 'Spl Donut', unitPrice: 40 },
      { itemName: 'Choco Truffle', unitPrice: 60 },
    ],
  },
  {
    shopName: 'Vijay Lakshmi (Cam Soori Tea Kadai)',
    whatsappNumber: '9585494158',
    items: [
      { itemName: 'Spl Bun', unitPrice: 12 },
      { itemName: 'Egg Puff (Half)', unitPrice: 20 },
      { itemName: 'Panner Puff', unitPrice: 25 },
      { itemName: 'Veg Puff', unitPrice: 17 },
      { itemName: 'Mushroom Puff', unitPrice: 25 },
      { itemName: 'Banana Cake', unitPrice: 500 },
      { itemName: 'Garlic Nippat', unitPrice: 400 },
      { itemName: 'Baby Bun', unitPrice: 30 },
      { itemName: 'Veg Cutlet', unitPrice: 20 },
      { itemName: 'Plain Cake', unitPrice: 380 },
      { itemName: 'Bread', unitPrice: 50 },
    ],
  },
  {
    shopName: 'Grand Homes Made',
    whatsappNumber: '9500010364',
    items: [
      { itemName: 'Bombay Mixture', unitPrice: 275 },
      { itemName: 'Bread', unitPrice: 38 },
      { itemName: 'Bun', unitPrice: 6 },
      { itemName: 'Butter Biscuit', unitPrice: 540 },
      { itemName: 'Chips', unitPrice: 400 },
      { itemName: 'Coconut Bun', unitPrice: 20 },
      { itemName: 'Cova Bun', unitPrice: 40 },
      { itemName: 'Egg Puff', unitPrice: 23 },
      { itemName: 'Kara Boondhi', unitPrice: 275 },
      { itemName: 'Masala Pori (200Gms)', unitPrice: 55 },
      { itemName: 'Mushroom Puffs', unitPrice: 25 },
      { itemName: 'Paneer Puff', unitPrice: 25 },
      { itemName: 'Pepper Nippat', unitPrice: 280 },
      { itemName: 'Pudina Mixture', unitPrice: 280 },
      { itemName: 'Regular Nippat', unitPrice: 275 },
      { itemName: 'Round Murk', unitPrice: 280 },
      { itemName: 'Salt Biscuit', unitPrice: 540 },
      { itemName: 'Samosa', unitPrice: 15 },
      { itemName: 'Spl Donut (L)', unitPrice: 40 },
      { itemName: 'Suthal Muruku', unitPrice: 500 },
      { itemName: 'Till Murk', unitPrice: 275 },
      { itemName: 'Veg Puff', unitPrice: 17 },
      { itemName: 'Veg Roll', unitPrice: 25 },
    ],
  },
  {
    shopName: 'Karupatti House (Fairmart Esta Pvt Ltd)',
    whatsappNumber: '9443669155',
    items: [
      { itemName: 'Bread', unitPrice: 35 },
      { itemName: 'Baby Bun', unitPrice: 30 },
      { itemName: 'Spl Bun', unitPrice: 10 },
    ],
  },
  {
    shopName: 'My Coffee Tea Shop',
    whatsappNumber: '6369390526',
    items: [
      { itemName: 'Bun', unitPrice: 5 },
    ],
  },
  {
    shopName: 'Tanishq',
    whatsappNumber: '9551230001',
    items: [
      { itemName: 'Cake (Kgs)', unitPrice: 650 },
    ],
  },
  {
    shopName: 'Uno Mindo',
    whatsappNumber: '7904379997',
    items: [
      { itemName: 'Bun', unitPrice: 4 },
      { itemName: 'Pav Bun', unitPrice: 4 },
      { itemName: 'Bread', unitPrice: 38 },
    ],
  },
  {
    shopName: 'Aavin Milk Shop',
    whatsappNumber: '9842070888',
    items: [
      { itemName: 'Bread', unitPrice: 35 },
    ],
  },
  {
    shopName: 'Sai Suprabaatham',
    whatsappNumber: '8760862928',
    items: [
      { itemName: 'Bread', unitPrice: 38 },
      { itemName: 'Bun', unitPrice: 4 },
      { itemName: 'Coconut Bun', unitPrice: 14 },
      { itemName: 'Cream Bun', unitPrice: 14 },
      { itemName: 'Dough Nut', unitPrice: 40 },
      { itemName: 'Egg Puff Full', unitPrice: 16 },
      { itemName: 'Fruit Cream Bun', unitPrice: 14 },
      { itemName: 'Jam Bun', unitPrice: 14 },
      { itemName: 'Mushroom Puffs', unitPrice: 18 },
      { itemName: 'Panner Puff', unitPrice: 18 },
      { itemName: 'Samosa', unitPrice: 11 },
      { itemName: 'Sandwich Bread', unitPrice: 84 },
      { itemName: 'Spl Donut', unitPrice: 40 },
      { itemName: 'Vegg Puff', unitPrice: 12 },
    ],
  },
  {
    shopName: 'VL Cafe Private Ltd',
    whatsappNumber: '9488802577',
    items: [
      { itemName: 'Veg Puff', unitPrice: 17 },
      { itemName: 'Egg Puff', unitPrice: 23 },
      { itemName: 'Cova Bun', unitPrice: 40 },
      { itemName: 'Black Forest', unitPrice: 45 },
      { itemName: 'Brownie Cake', unitPrice: 40 },
      { itemName: 'Spl Donut', unitPrice: 40 },
      { itemName: 'Choco Truffle', unitPrice: 60 },
      { itemName: 'Double Chocolate', unitPrice: 80 },
    ],
  },
  {
    shopName: 'Tamil Panipuri',
    whatsappNumber: '9500897206',
    items: [
      { itemName: 'Samosa', unitPrice: 15 },
    ],
  },
  {
    shopName: 'Anjana Super Market',
    whatsappNumber: '9629649663',
    items: [
      { itemName: 'Bread', unitPrice: 35 },
      { itemName: 'Wheat Bread', unitPrice: 35 },
      { itemName: 'Spl Bun', unitPrice: 10 },
      { itemName: 'Rusk (Pkt)', unitPrice: 55 },
    ],
  },
  {
    shopName: 'Rotary Club Of Sipcot',
    whatsappNumber: '9043030922',
    items: [
      { itemName: 'Birthday Prime Cake', unitPrice: 750 },
    ],
  },
  {
    shopName: 'Rotary Club Of Midtown',
    whatsappNumber: '8825400625',
    items: [
      { itemName: 'Birthday Prime Cake', unitPrice: 750 },
    ],
  },
  {
    shopName: 'Rotary Club Of Hosur',
    whatsappNumber: '8012580848',
    items: [
      { itemName: 'Birthday Prime Cake', unitPrice: 750 },
    ],
  },
];
