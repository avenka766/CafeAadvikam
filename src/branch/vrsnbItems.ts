// src/branch/vrsnbItems.ts
// Auto-generated from CAFE_AADVIKAM_FINAL_PRICE_LIST.xlsx
// Used by VRSNB branch for billing and admin item management.

export interface VrsnbItem {
  barcode: number;
  name: string;
  price: number;
  uom: 'Nos' | 'Kgs';
  category: VrsnbCategory;
}

export type VrsnbCategory =
  | 'CHIPS'
  | 'MURUK'
  | 'MIXTURE'
  | 'PAKODA'
  | 'NIPPAT'
  | 'DAL'
  | 'BAKERY'
  | 'CAKE'
  | 'COOKIES'
  | 'HALWA'
  | 'JAMUN'
  | 'MYSORE PAK'
  | 'BAKLAVA'
  | 'CASHEW SWEETS'
  | 'CASHEW BISCUIT'
  | 'CAKE ROLL'
  | 'BURFI'
  | 'PEDA'
  | 'LADDU'
  | 'CASHEW LADDU'
  | 'MIX'
  | 'CHOCOLATE'
  | 'SWEETS'
  | 'SPL SWEETS';

export const VRSNB_CATEGORIES: VrsnbCategory[] = [
  'CHIPS',
  'MURUK',
  'MIXTURE',
  'PAKODA',
  'NIPPAT',
  'DAL',
  'BAKERY',
  'CAKE',
  'COOKIES',
  'HALWA',
  'JAMUN',
  'MYSORE PAK',
  'BAKLAVA',
  'CASHEW SWEETS',
  'CASHEW BISCUIT',
  'CAKE ROLL',
  'BURFI',
  'PEDA',
  'LADDU',
  'CASHEW LADDU',
  'MIX',
  'CHOCOLATE',
  'SWEETS',
  'SPL SWEETS',
];

export const VRSNB_ITEMS: VrsnbItem[] = [
  // ── CHIPS ─────────────────────────────────────────────────────────────────
  { barcode: 2001, name: 'Banana chips (200g)',              price: 120,  uom: 'Nos', category: 'CHIPS' },
  { barcode: 2002, name: 'Corn chips (200g)',                price: 80,   uom: 'Nos', category: 'CHIPS' },
  { barcode: 2003, name: 'Potato chips (150g)',              price: 68,   uom: 'Nos', category: 'CHIPS' },
  { barcode: 2004, name: 'Tapico chips (100g)',              price: 60,   uom: 'Nos', category: 'CHIPS' },

  // ── MURUK ─────────────────────────────────────────────────────────────────
  { barcode: 2005, name: 'Beetroot muruk (200g)',            price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2006, name: 'Benne muruk (200g)',               price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2007, name: 'Chettinadu muruk (200g)',          price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2008, name: 'Garlic muruk (200g)',              price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2009, name: 'Gavani rice muruk (200g)',         price: 120,  uom: 'Nos', category: 'MURUK' },
  { barcode: 2010, name: 'Kaisuthal muruk (200g)',           price: 120,  uom: 'Nos', category: 'MURUK' },
  { barcode: 2011, name: 'Kambu muruk (200g)',               price: 120,  uom: 'Nos', category: 'MURUK' },
  { barcode: 2012, name: 'Masala groundnut (200g)',          price: 80,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2013, name: 'Mullu muruk (200g)',               price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2014, name: 'Onion rings (200g)',               price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2015, name: 'Ragi muruk (200g)',                price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2016, name: 'Red rice muruk (200g)',            price: 120,  uom: 'Nos', category: 'MURUK' },
  { barcode: 2017, name: 'Rings (200g)',                     price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2018, name: 'Samai muruk (200g)',               price: 88,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2019, name: 'Seedai (200g)',                    price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2020, name: 'Thenkuzhal salt muruk (200g)',     price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2021, name: 'Thenkuzhal masala muruk (200g)',   price: 80,   uom: 'Nos', category: 'MURUK' },
  { barcode: 2022, name: 'Till muruk (200g)',                price: 80,   uom: 'Nos', category: 'MURUK' },

  // ── MIXTURE ───────────────────────────────────────────────────────────────
  { barcode: 2023, name: 'Avalakki mixture (200g)',          price: 90,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2024, name: 'Spl Berigai mixture (200g)',       price: 90,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2025, name: 'Bombay mixture (200g)',            price: 80,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2026, name: 'Masala cashew (100g)',             price: 120,  uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2027, name: 'Pepper cashew (100g)',             price: 120,  uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2028, name: 'Dryfruit mixture (200g)',          price: 120,  uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2029, name: 'Kara boondhi (200g)',              price: 80,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2030, name: 'Kara sev (200g)',                  price: 80,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2031, name: 'Mangalore mixture (200g)',         price: 80,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2032, name: 'Om pudi (200g)',                   price: 80,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2033, name: 'Pudhina mixture (200g)',           price: 88,   uom: 'Nos', category: 'MIXTURE' },
  { barcode: 2034, name: 'Ragi mixture (200g)',              price: 88,   uom: 'Nos', category: 'MIXTURE' },

  // ── PAKODA ────────────────────────────────────────────────────────────────
  { barcode: 2035, name: 'Cashew pakoda (200g)',             price: 80,   uom: 'Nos', category: 'PAKODA' },
  { barcode: 2036, name: 'Pearl onion pakoda (200g)',        price: 80,   uom: 'Nos', category: 'PAKODA' },

  // ── NIPPAT ────────────────────────────────────────────────────────────────
  { barcode: 2037, name: 'Garlic nippat (200g)',             price: 80,   uom: 'Nos', category: 'NIPPAT' },
  { barcode: 2038, name: 'Pepper nippat (200g)',             price: 80,   uom: 'Nos', category: 'NIPPAT' },
  { barcode: 2039, name: 'Ragi nippat (200g)',               price: 80,   uom: 'Nos', category: 'NIPPAT' },
  { barcode: 2040, name: 'Regular nippat (200g)',            price: 80,   uom: 'Nos', category: 'NIPPAT' },

  // ── DAL ───────────────────────────────────────────────────────────────────
  { barcode: 2041, name: 'Avalakki (200g)',                  price: 80,   uom: 'Nos', category: 'DAL' },
  { barcode: 2042, name: 'Congress (200g)',                  price: 80,   uom: 'Nos', category: 'DAL' },
  { barcode: 2043, name: 'Masala pori (200g)',               price: 80,   uom: 'Nos', category: 'DAL' },
  { barcode: 2044, name: 'Mix dal (200g)',                   price: 100,  uom: 'Nos', category: 'DAL' },
  { barcode: 2045, name: 'Moong dal (200g)',                 price: 80,   uom: 'Nos', category: 'DAL' },

  // ── BAKERY ────────────────────────────────────────────────────────────────
  { barcode: 2046, name: 'Bread',                            price: 50,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2047, name: 'Bun',                              price: 36,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2048, name: 'Cova bun',                         price: 50,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2049, name: 'Dilpasand',                        price: 70,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2050, name: 'Om stick',                         price: 65,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2051, name: 'Rusk',                             price: 70,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2052, name: 'Spl bun',                          price: 50,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2053, name: 'Badam milk cool',                  price: 60,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2054, name: 'Elaneer payasam',                  price: 60,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2055, name: 'Rose milk cool',                   price: 60,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2056, name: 'Veg puff',                         price: 20,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2057, name: 'Samosa',                           price: 15,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2058, name: 'Paneer puff',                      price: 25,   uom: 'Nos', category: 'BAKERY' },
  { barcode: 2059, name: 'Veg roll',                         price: 25,   uom: 'Nos', category: 'BAKERY' },

  // ── CAKE ──────────────────────────────────────────────────────────────────
  { barcode: 2060, name: 'Banana cake',                      price: 50,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2061, name: 'Berry blast (Strawberry, Blueberry)', price: 900, uom: 'Kgs', category: 'CAKE' },
  { barcode: 2062, name: 'Birthday cake',                    price: 400,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2063, name: 'Birthday flavour',                 price: 430,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2064, name: 'Birthday prime flavour',           price: 500,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2065, name: 'Black current',                    price: 900,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2066, name: 'Black forest',                     price: 800,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2067, name: 'Black nutty bubble',               price: 1000, uom: 'Kgs', category: 'CAKE' },
  { barcode: 2068, name: 'Brownie 30',                       price: 30,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2069, name: 'Brownie 40',                       price: 40,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2070, name: 'Butterscotch cake',                price: 900,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2071, name: 'Choco truffle cake',               price: 800,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2072, name: 'Chocolate pc cake',                price: 20,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2073, name: 'Chocolate cake',                   price: 500,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2074, name: 'Cream pc cake',                    price: 20,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2075, name: 'Donut',                            price: 50,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2076, name: 'Double chocolate cake',            price: 800,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2077, name: 'Honey pc cake',                    price: 20,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2078, name: 'Ice cake 100',                     price: 100,  uom: 'Nos', category: 'CAKE' },
  { barcode: 2079, name: 'Ice cake 50',                      price: 50,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2080, name: 'Jam burger',                       price: 30,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2081, name: 'Mango cake',                       price: 900,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2082, name: 'Milk ice pc cake',                 price: 100,  uom: 'Nos', category: 'CAKE' },
  { barcode: 2083, name: 'Muffin',                           price: 30,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2084, name: 'Nutty bubble',                     price: 1000, uom: 'Kgs', category: 'CAKE' },
  { barcode: 2085, name: 'Pineapple belight',                price: 900,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2086, name: 'Plain cake',                       price: 340,  uom: 'Kgs', category: 'CAKE' },
  { barcode: 2087, name: 'Rasamalai cake',                   price: 1000, uom: 'Kgs', category: 'CAKE' },
  { barcode: 2088, name: 'Spl butter cream pc cake',         price: 30,   uom: 'Nos', category: 'CAKE' },
  { barcode: 2089, name: 'White forest cake',                price: 800,  uom: 'Kgs', category: 'CAKE' },

  // ── COOKIES ───────────────────────────────────────────────────────────────
  { barcode: 2090, name: 'Badam sticks',                     price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2091, name: 'Bournvita biscuit',                 price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2092, name: 'Butter biscuit',                   price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2093, name: 'Coconut biscuit',                  price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2094, name: 'Coconut crunch',                   price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2095, name: 'Groundnut biscuit',                price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2096, name: 'Honey badam cookies',              price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2097, name: 'Kara biscuit',                     price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2098, name: 'Milk biscuit',                     price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2099, name: 'Millet cookies',                   price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2100, name: 'Oats cookies',                     price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2101, name: 'Ragi biscuit',                     price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2102, name: 'Salt biscuit',                     price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2103, name: 'Spl cookies',                      price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2104, name: 'Spl om sticks',                    price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2105, name: 'Spl rusk',                         price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2106, name: 'Vanilla crunch',                   price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2107, name: 'Wheat biscuit',                    price: 130,  uom: 'Nos', category: 'COOKIES' },
  { barcode: 2108, name: 'Zebra biscuit',                    price: 130,  uom: 'Nos', category: 'COOKIES' },

  // ── HALWA ─────────────────────────────────────────────────────────────────
  { barcode: 2109, name: 'Black grapes halwa',               price: 700,  uom: 'Kgs', category: 'HALWA' },
  { barcode: 2110, name: 'Black rice halwa',                 price: 700,  uom: 'Kgs', category: 'HALWA' },
  { barcode: 2111, name: 'Carrot halwa',                     price: 700,  uom: 'Kgs', category: 'HALWA' },
  { barcode: 2112, name: 'Dom rotti halwa',                  price: 60,   uom: 'Nos', category: 'HALWA' },
  { barcode: 2113, name: 'Elaneer halwa',                    price: 700,  uom: 'Kgs', category: 'HALWA' },
  { barcode: 2114, name: 'Papaya halwa',                     price: 700,  uom: 'Kgs', category: 'HALWA' },
  { barcode: 2115, name: 'Paruthi pal halwa',                price: 700,  uom: 'Kgs', category: 'HALWA' },
  { barcode: 2116, name: 'Pumpkin halwa',                    price: 700,  uom: 'Kgs', category: 'HALWA' },
  { barcode: 2117, name: 'Watermelon halwa',                 price: 700,  uom: 'Kgs', category: 'HALWA' },
  { barcode: 2118, name: 'Wheat halwa',                      price: 700,  uom: 'Kgs', category: 'HALWA' },

  // ── JAMUN ─────────────────────────────────────────────────────────────────
  { barcode: 2119, name: 'Gulab jamun',                      price: 25,   uom: 'Nos', category: 'JAMUN' },
  { barcode: 2120, name: 'Kala jamun',                       price: 25,   uom: 'Nos', category: 'JAMUN' },
  { barcode: 2121, name: 'Kesar jamun',                      price: 25,   uom: 'Nos', category: 'JAMUN' },
  { barcode: 2122, name: 'Makkan peda',                      price: 25,   uom: 'Nos', category: 'JAMUN' },
  { barcode: 2123, name: 'Mini jamun',                       price: 600,  uom: 'Kgs', category: 'JAMUN' },
  { barcode: 2124, name: 'Rabdi',                            price: 45,   uom: 'Nos', category: 'JAMUN' },
  { barcode: 2125, name: 'Rasamalai / Malaikulla',           price: 40,   uom: 'Nos', category: 'JAMUN' },

  // ── MYSORE PAK ────────────────────────────────────────────────────────────
  { barcode: 2126, name: 'Beetroot mysore pak',              price: 700,  uom: 'Kgs', category: 'MYSORE PAK' },
  { barcode: 2127, name: 'Butter mysore pak',                price: 700,  uom: 'Kgs', category: 'MYSORE PAK' },
  { barcode: 2128, name: 'Carrot mysore pak',                price: 700,  uom: 'Kgs', category: 'MYSORE PAK' },
  { barcode: 2129, name: 'Karupatti mysore pak',             price: 700,  uom: 'Kgs', category: 'MYSORE PAK' },
  { barcode: 2130, name: 'Milk cake',                        price: 700,  uom: 'Kgs', category: 'MYSORE PAK' },

  // ── BAKLAVA ───────────────────────────────────────────────────────────────
  { barcode: 2131, name: 'Baklawa almond',                   price: 1400, uom: 'Kgs', category: 'BAKLAVA' },
  { barcode: 2132, name: 'Cashew asabi',                     price: 1400, uom: 'Kgs', category: 'BAKLAVA' },
  { barcode: 2133, name: 'Crown baklava',                    price: 1400, uom: 'Kgs', category: 'BAKLAVA' },
  { barcode: 2134, name: 'Pista baklawa',                    price: 1400, uom: 'Kgs', category: 'BAKLAVA' },

  // ── CASHEW SWEETS ─────────────────────────────────────────────────────────
  { barcode: 2135, name: 'American dates roll',              price: 1100, uom: 'Kgs', category: 'CASHEW SWEETS' },
  { barcode: 2136, name: 'American dryfruit burfi',          price: 1100, uom: 'Kgs', category: 'CASHEW SWEETS' },
  { barcode: 2137, name: 'Anjur sweets',                     price: 1100, uom: 'Kgs', category: 'CASHEW SWEETS' },
  { barcode: 2138, name: 'Chocolate wafer munch',            price: 1100, uom: 'Kgs', category: 'CASHEW SWEETS' },
  { barcode: 2139, name: 'Kaju katli',                       price: 1100, uom: 'Kgs', category: 'CASHEW SWEETS' },
  { barcode: 2140, name: 'Vanilla wafer munch',              price: 1100, uom: 'Kgs', category: 'CASHEW SWEETS' },

  // ── CASHEW BISCUIT ────────────────────────────────────────────────────────
  { barcode: 2141, name: 'Butterscotch cashew biscuit',      price: 1100, uom: 'Kgs', category: 'CASHEW BISCUIT' },
  { barcode: 2142, name: 'Choco cashew biscuit',             price: 1100, uom: 'Kgs', category: 'CASHEW BISCUIT' },
  { barcode: 2143, name: 'Dryfruit punch',                   price: 1100, uom: 'Kgs', category: 'CASHEW BISCUIT' },
  { barcode: 2144, name: 'Dry rose cashew biscuit',          price: 1100, uom: 'Kgs', category: 'CASHEW BISCUIT' },
  { barcode: 2145, name: 'Kesar cashew biscuit',             price: 1100, uom: 'Kgs', category: 'CASHEW BISCUIT' },
  { barcode: 2146, name: 'Mango cashew biscuit',             price: 1100, uom: 'Kgs', category: 'CASHEW BISCUIT' },
  { barcode: 2147, name: 'Pista cashew biscuit',             price: 1100, uom: 'Kgs', category: 'CASHEW BISCUIT' },
  { barcode: 2148, name: 'Walnut cashew biscuit',            price: 1100, uom: 'Kgs', category: 'CASHEW BISCUIT' },

  // ── CAKE ROLL ─────────────────────────────────────────────────────────────
  { barcode: 2149, name: 'Orange cashew cake roll',          price: 1100, uom: 'Kgs', category: 'CAKE ROLL' },
  { barcode: 2150, name: 'Vanilla cashew cake roll',         price: 1100, uom: 'Kgs', category: 'CAKE ROLL' },

  // ── BURFI ─────────────────────────────────────────────────────────────────
  { barcode: 2151, name: 'Dry seeds burfi',                  price: 1100, uom: 'Kgs', category: 'BURFI' },
  { barcode: 2152, name: 'Mango burfi',                      price: 700,  uom: 'Kgs', category: 'BURFI' },
  { barcode: 2153, name: 'Mix millet burfi',                 price: 700,  uom: 'Kgs', category: 'BURFI' },
  { barcode: 2154, name: 'Orange ice cream burfi',           price: 700,  uom: 'Kgs', category: 'BURFI' },
  { barcode: 2155, name: 'Red velvet burfi',                 price: 700,  uom: 'Kgs', category: 'BURFI' },
  { barcode: 2156, name: 'Solamavu burfi',                   price: 700,  uom: 'Kgs', category: 'BURFI' },
  { barcode: 2157, name: 'Thinnai burfi',                    price: 700,  uom: 'Kgs', category: 'BURFI' },
  { barcode: 2158, name: 'Vanilla burfi',                    price: 700,  uom: 'Kgs', category: 'BURFI' },

  // ── PEDA ──────────────────────────────────────────────────────────────────
  { barcode: 2159, name: 'Chocolate peda',                   price: 700,  uom: 'Kgs', category: 'PEDA' },
  { barcode: 2160, name: 'Kesar peda',                       price: 700,  uom: 'Kgs', category: 'PEDA' },
  { barcode: 2161, name: 'Madura peda',                      price: 700,  uom: 'Kgs', category: 'PEDA' },
  { barcode: 2162, name: 'Milk peda',                        price: 700,  uom: 'Kgs', category: 'PEDA' },

  // ── LADDU ─────────────────────────────────────────────────────────────────
  { barcode: 2163, name: 'Dryfruit laddu',                   price: 700,  uom: 'Kgs', category: 'LADDU' },
  { barcode: 2164, name: 'Ghee laddu',                       price: 700,  uom: 'Kgs', category: 'LADDU' },
  { barcode: 2165, name: 'Karupatti laddu',                  price: 700,  uom: 'Kgs', category: 'LADDU' },
  { barcode: 2166, name: 'Karupu ulundha laddu',             price: 700,  uom: 'Kgs', category: 'LADDU' },
  { barcode: 2167, name: 'Kollu laddu',                      price: 700,  uom: 'Kgs', category: 'LADDU' },
  { barcode: 2168, name: 'Pasi parupu laddu',                price: 700,  uom: 'Kgs', category: 'LADDU' },
  { barcode: 2169, name: 'Ragi laddu',                       price: 700,  uom: 'Kgs', category: 'LADDU' },
  { barcode: 2170, name: 'Spl thirupathi laddu',             price: 700,  uom: 'Kgs', category: 'LADDU' },
  { barcode: 2171, name: 'Yellu laddu',                      price: 700,  uom: 'Kgs', category: 'LADDU' },

  // ── CASHEW LADDU ──────────────────────────────────────────────────────────
  { barcode: 2172, name: 'Badam cashew laddu',               price: 1200, uom: 'Kgs', category: 'CASHEW LADDU' },
  { barcode: 2173, name: 'Choco cashew laddu',               price: 1200, uom: 'Kgs', category: 'CASHEW LADDU' },
  { barcode: 2174, name: 'Dry rose cashew laddu',            price: 1200, uom: 'Kgs', category: 'CASHEW LADDU' },
  { barcode: 2175, name: 'Pista cashew laddu',               price: 1200, uom: 'Kgs', category: 'CASHEW LADDU' },
  { barcode: 2176, name: 'Rice ball cashew laddu',           price: 1200, uom: 'Kgs', category: 'CASHEW LADDU' },

  // ── MIX ───────────────────────────────────────────────────────────────────
  { barcode: 2177, name: 'Mix burfi',                        price: 700,  uom: 'Kgs', category: 'MIX' },
  { barcode: 2178, name: 'Mix cashew laddu',                 price: 1200, uom: 'Kgs', category: 'MIX' },
  { barcode: 2179, name: 'Mix cashew biscuit & sweets',      price: 1100, uom: 'Kgs', category: 'MIX' },
  { barcode: 2180, name: 'Mix laddu',                        price: 700,  uom: 'Kgs', category: 'MIX' },
  { barcode: 2181, name: 'Mix peda',                         price: 700,  uom: 'Kgs', category: 'MIX' },
  { barcode: 2182, name: 'Mix spl mysore pak',               price: 800,  uom: 'Kgs', category: 'MIX' },
  { barcode: 2183, name: 'Mix spl sweets',                   price: 700,  uom: 'Kgs', category: 'MIX' },

  // ── CHOCOLATE ─────────────────────────────────────────────────────────────
  { barcode: 2184, name: 'SNB chocolate',                    price: 1500, uom: 'Kgs', category: 'CHOCOLATE' },
  { barcode: 2185, name: 'SNB lollipop',                     price: 15,   uom: 'Nos', category: 'CHOCOLATE' },

  // ── SWEETS ────────────────────────────────────────────────────────────────
  { barcode: 2186, name: 'Agrapan',                          price: 700,  uom: 'Kgs', category: 'SWEETS' },
  { barcode: 2187, name: 'Athirasam',                        price: 10,   uom: 'Nos', category: 'SWEETS' },
  { barcode: 2188, name: 'Bengali sweets',                   price: 700,  uom: 'Kgs', category: 'SWEETS' },
  { barcode: 2189, name: 'Jalebi',                           price: 400,  uom: 'Kgs', category: 'SWEETS' },
  { barcode: 2190, name: 'Jangiri',                          price: 400,  uom: 'Kgs', category: 'SWEETS' },
  { barcode: 2191, name: 'Mini badusha',                     price: 580,  uom: 'Kgs', category: 'SWEETS' },
  { barcode: 2192, name: 'Oppat',                            price: 20,   uom: 'Nos', category: 'SWEETS' },
  { barcode: 2193, name: 'Soan papdi',                       price: 700,  uom: 'Kgs', category: 'SWEETS' },

  // ── SPL SWEETS ────────────────────────────────────────────────────────────
  { barcode: 2194, name: 'Badam mysore pak',                 price: 800,  uom: 'Kgs', category: 'SPL SWEETS' },
  { barcode: 2195, name: 'Cashew mysore pak',                price: 800,  uom: 'Kgs', category: 'SPL SWEETS' },
  { barcode: 2196, name: 'Kambu mysore pak',                 price: 800,  uom: 'Kgs', category: 'SPL SWEETS' },
  { barcode: 2197, name: 'Kollu mysore pak',                 price: 800,  uom: 'Kgs', category: 'SPL SWEETS' },
  { barcode: 2198, name: 'Pacha payir mysore pak',           price: 800,  uom: 'Kgs', category: 'SPL SWEETS' },
  { barcode: 2199, name: 'Pista mysore pak',                 price: 800,  uom: 'Kgs', category: 'SPL SWEETS' },
];
