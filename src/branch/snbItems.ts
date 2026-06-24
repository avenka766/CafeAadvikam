// src/branch/snbItems.ts
// Auto-generated from SNB_FINAL_PRICE_LIST.xlsx
// Used by SNB and Hosur branches for billing and admin item management.

export interface SnbItem {
  barcode: number;
  name: string;
  price: number;
  uom: 'Nos' | 'Kgs';
  category: SnbCategory;
}

export type SnbCategory =
  | 'Bread & Buns'
  | 'Cakes (by kg)'
  | 'Biscuits & Cookies'
  | 'Chocolates'
  | 'Individual Cakes'
  | 'Buns & Pastries'
  | 'Namkeens & Mixtures'
  | 'Packaged Snacks'
  | 'Sweets'
  | 'Birthday Cakes'
  | 'Beverages & Others';

export const SNB_CATEGORIES: SnbCategory[] = [
  'Bread & Buns',
  'Cakes (by kg)',
  'Biscuits & Cookies',
  'Chocolates',
  'Individual Cakes',
  'Buns & Pastries',
  'Namkeens & Mixtures',
  'Packaged Snacks',
  'Sweets',
  'Birthday Cakes',
  'Beverages & Others',
];

export const SNB_ITEMS: SnbItem[] = [
  // ── Bread & Buns ──────────────────────────────────────────────────────────
  { barcode: 1001, name: 'BUN',              price: 6,   uom: 'Nos', category: 'Bread & Buns' },
  { barcode: 1002, name: 'SPL BUN',          price: 12,  uom: 'Nos', category: 'Bread & Buns' },
  { barcode: 1003, name: 'BREAD',            price: 50,  uom: 'Nos', category: 'Bread & Buns' },
  { barcode: 1004, name: 'WHEAT BREAD',      price: 50,  uom: 'Nos', category: 'Bread & Buns' },
  { barcode: 1005, name: 'Om Sticks (250G)', price: 70,  uom: 'Nos', category: 'Bread & Buns' },
  { barcode: 1006, name: 'Rusk (250G)',      price: 70,  uom: 'Nos', category: 'Bread & Buns' },
  { barcode: 1007, name: 'MUFFIN',          price: 15,  uom: 'Nos', category: 'Bread & Buns' },
  { barcode: 1008, name: 'NAAN',            price: 50,  uom: 'Nos', category: 'Bread & Buns' },
  { barcode: 1009, name: 'BAKED NIPPAT',    price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },

  // ── Cakes (by kg) ─────────────────────────────────────────────────────────
  { barcode: 1010, name: 'PLAIN CAKE',   price: 340, uom: 'Kgs', category: 'Cakes (by kg)' },
  { barcode: 1011, name: 'FRUIT CAKE',   price: 600, uom: 'Kgs', category: 'Cakes (by kg)' },
  { barcode: 1012, name: 'BANANA CAKE',  price: 460, uom: 'Kgs', category: 'Cakes (by kg)' },
  { barcode: 1013, name: 'CARROT CAKE',  price: 460, uom: 'Kgs', category: 'Cakes (by kg)' },
  { barcode: 1014, name: 'BADAM STICKS', price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1015, name: 'BOURNVITA BISCUIT', price: 600, uom: 'Kgs', category: 'Cakes (by kg)' },

  // ── Biscuits & Cookies ────────────────────────────────────────────────────
  { barcode: 1016, name: 'BUTTER BISCUIT',       price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1017, name: 'CASHEW BISCUIT',       price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1018, name: 'COCONUT BISCUIT',      price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1019, name: 'COCONUT CRUNCH',       price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1020, name: 'COCONUT MACAROONS',    price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1021, name: 'GINGER COOKIES',       price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1022, name: 'GROUNDNUT BISCUIT',    price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1023, name: 'HONEY BADAM COOKIES',  price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1024, name: 'KARA BISCUIT',         price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1025, name: 'MILK BISCUIT',         price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1026, name: 'MIX BISCUITS',         price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1027, name: 'RAGI BISCUIT',         price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1028, name: 'SALT BISCUIT',         price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1029, name: 'SPL OM STICKS',        price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1030, name: 'SPL RUSK',             price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1031, name: 'VANILLA CRUNCH',       price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1032, name: 'WHEAT BISCUIT',        price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1033, name: 'ZEBRA BISCUIT',        price: 600, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1034, name: 'MILLETS COOKIES',      price: 700, uom: 'Kgs', category: 'Biscuits & Cookies' },
  { barcode: 1035, name: 'OATS BISCUITS',        price: 700, uom: 'Kgs', category: 'Biscuits & Cookies' },

  // ── Chocolates ────────────────────────────────────────────────────────────
  { barcode: 1036, name: 'SNB CHOCOLATES', price: 1500, uom: 'Kgs', category: 'Chocolates' },
  { barcode: 1037, name: 'SNB LOLLIPOP',   price: 15,   uom: 'Nos', category: 'Chocolates' },

  // ── Individual Cakes ──────────────────────────────────────────────────────
  { barcode: 1038, name: 'CHOCOLATE CAKE',       price: 20,  uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1039, name: 'CREAM CAKE',           price: 20,  uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1040, name: 'HONEY CAKE',           price: 20,  uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1041, name: 'SPL BUTTER CREAM CAKE',price: 30,  uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1042, name: 'Brownie Cake',         price: 30,  uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1043, name: 'ICE CAKE 60',          price: 60,  uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1044, name: 'ICE CAKE 70',          price: 70,  uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1045, name: 'ICE CAKE 90',          price: 90,  uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1046, name: 'ICE CAKE 100',         price: 100, uom: 'Nos', category: 'Individual Cakes' },
  { barcode: 1047, name: 'Double Chocolate',     price: 100, uom: 'Nos', category: 'Individual Cakes' },

  // ── Buns & Pastries ───────────────────────────────────────────────────────
  { barcode: 1048, name: 'CREAM BUN',            price: 20,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1049, name: 'JAM BUN',              price: 20,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1050, name: 'DOUGH NUT',            price: 20,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1051, name: 'Cova Bun',             price: 40,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1052, name: 'Chocolate Cream Bun',  price: 25,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1053, name: 'Fruit Cream Bun',      price: 25,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1054, name: 'DILPASAND',            price: 17.5,uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1055, name: 'SPL DOUGHNUT',         price: 50,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1056, name: 'VEG PUFF',             price: 20,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1057, name: 'KACHORI',              price: 15,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1058, name: 'SAMOSA',               price: 15,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1059, name: 'PANEER PUFF',          price: 25,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1060, name: 'KARA BUN',             price: 10,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1061, name: 'MASALA BUN',           price: 15,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1062, name: 'BREAD TOAST',          price: 15,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1063, name: 'VEG ROLL',             price: 25,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1064, name: 'BURGER',               price: 40,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1065, name: 'PIZZA',                price: 40,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1066, name: 'VEG SANDWICH',         price: 40,  uom: 'Nos', category: 'Buns & Pastries' },
  { barcode: 1067, name: 'Veg Cutlet',           price: 18,  uom: 'Nos', category: 'Buns & Pastries' },

  // ── Namkeens & Mixtures ───────────────────────────────────────────────────
  { barcode: 1068, name: 'KARA BOONDHI',         price: 360, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1069, name: 'BOMBAY MIXTURE',        price: 360, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1070, name: 'MANGALORE MIXTURE',     price: 360, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1071, name: 'REGULAR MIXTURE',       price: 360, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1072, name: 'BERIGAI MIXTURE',       price: 460, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1073, name: 'RAGI MIXTURE',          price: 400, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1074, name: 'RINGS',                 price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1075, name: 'BENNE MURUK',           price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1076, name: 'MOTA SEV',              price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1077, name: 'CHETTINADU MURUK',       price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1078, name: 'RIBBON MURUK',           price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1079, name: 'TILL MURUK',             price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1080, name: 'OM PUDI',               price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1081, name: 'CURRY MURUK',           price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1082, name: 'ROUND MURUK',            price: 400, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1083, name: 'ONION MURUK',            price: 400, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1084, name: 'Jangiri Muruk',         price: 400, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1085, name: 'Suthal Muruku',         price: 600, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1086, name: 'Spl Muruk',             price: 400, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1087, name: 'MILLET MURUK',          price: 600, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1088, name: 'PAKODA',                price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1089, name: 'BITTER GOURD PAKODA',   price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1090, name: 'FINGER CHIPS',          price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1091, name: 'PEARL PAKODA',          price: 400, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1092, name: 'GARLIC NIPPAT',         price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1093, name: 'REGULAR NIPPAT',        price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },
  { barcode: 1094, name: 'Ragi Nippat',           price: 380, uom: 'Kgs', category: 'Namkeens & Mixtures' },

  // ── Packaged Snacks ───────────────────────────────────────────────────────
  { barcode: 1095, name: 'WHEEL CHIPS',           price: 20,  uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1096, name: 'CHIPS',                 price: 50,  uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1097, name: 'BANANA CHIPS',         price: 60,  uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1098, name: 'Chana Dal (250G)',       price: 100, uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1099, name: 'Mix Dal (250G)',         price: 100, uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1100, name: 'Masala Cashew (100G)',   price: 120, uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1101, name: 'Congress (250G)',        price: 100, uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1102, name: 'Sweet Biscuit (250G)',   price: 90,  uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1103, name: 'Corn Chips (250G)',      price: 90,  uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1104, name: 'Avalakki (250G)',        price: 90,  uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1105, name: 'Moong Dal (250G)',       price: 90,  uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1106, name: 'Masala Groundnut (250G)',price: 90,  uom: 'Nos', category: 'Packaged Snacks' },
  { barcode: 1107, name: 'Masala Pori (220G)',     price: 80,  uom: 'Nos', category: 'Packaged Snacks' },

  // ── Sweets ────────────────────────────────────────────────────────────────
  { barcode: 1108, name: 'BENGALI SWEETS',        price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1109, name: 'CASHEW SWEETS',         price: 1000, uom: 'Kgs', category: 'Sweets' },
  { barcode: 1110, name: 'Anjur Sweets',          price: 1300, uom: 'Kgs', category: 'Sweets' },
  { barcode: 1111, name: 'KAJU BITE',             price: 1200, uom: 'Kgs', category: 'Sweets' },
  { barcode: 1112, name: 'MYSORE PAK',            price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1113, name: 'BOOST BURFI',           price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1114, name: 'HORLICKS BURFI',        price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1115, name: 'COCONUT  BURFI',        price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1116, name: 'PEDA',                  price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1117, name: 'THIRUPATHI LAADU',      price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1118, name: 'SOAN PAPDI',            price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1119, name: 'RAVA LADDU',            price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1120, name: 'BOMBAY HALWA',          price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1121, name: 'CHANDRAKALA',           price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1122, name: 'MINI BADUSHA',          price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1123, name: 'HALWA',                 price: 600,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1124, name: 'JANGIRI',               price: 400,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1125, name: 'JELABI',                price: 360,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1126, name: 'PEANUT BURFI',          price: 400,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1127, name: 'TILL BURFI',            price: 400,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1128, name: 'SWEET BOONDHI',         price: 320,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1129, name: 'AGRAPAN',               price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1130, name: 'BESHAN LADDU',          price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1131, name: 'SPL JELABI',            price: 400,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1132, name: 'JAGGERY COCONUT BURFI', price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1133, name: 'SPL MYSORE PAK',        price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1134, name: 'SPL HORLICKS BURFI',    price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1135, name: 'SPL BOOST BURFI',       price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1136, name: 'SPL MILK MYSOREPAK',    price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1137, name: 'SPL MOTI LAADU',        price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1138, name: 'SPL PEDA',              price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1139, name: 'SPL DATAS BURFI',       price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1140, name: 'SPL DATAS LAADU',       price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1141, name: 'SPL SOAN PAPDI',        price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1142, name: 'SPL CARROT MYSOREPAK',  price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1143, name: 'Spl Beetrooth Mysurepak',price: 720, uom: 'Kgs', category: 'Sweets' },
  { barcode: 1144, name: 'Spl Lala Mysurepak',    price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1145, name: 'MILLET MYSOREPAK',      price: 800,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1146, name: 'TODAY SPL HALWA',       price: 720,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1147, name: 'RASAMALAI / MALAIKULLA',price: 40,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1148, name: 'JAMOON',                price: 20,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1149, name: 'OPPAT',                 price: 25,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1150, name: 'PUFFED RICE BALL',      price: 10,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1151, name: 'POPCORN',               price: 50,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1152, name: 'MIX CAKE AND PAKODA',   price: 5,    uom: 'Nos', category: 'Sweets' },
  { barcode: 1153, name: 'Baklava',               price: 1800, uom: 'Kgs', category: 'Sweets' },
  { barcode: 1154, name: 'MINI CHEESE CAKE',      price: 40,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1155, name: 'Bread Chilly',          price: 50,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1156, name: 'Cova Dilpasand',        price: 100,  uom: 'Nos', category: 'Sweets' },
  { barcode: 1157, name: 'ACHU MURUKKU (125 GMS)',price: 50,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1158, name: 'ATHIRASAM',             price: 10,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1159, name: 'Maddur Vada',           price: 10,   uom: 'Nos', category: 'Sweets' },
  { barcode: 1160, name: 'AVARA MIX DAL',         price: 800,  uom: 'Kgs', category: 'Sweets' },
  { barcode: 1161, name: 'SEDAI',                 price: 370,  uom: 'Kgs', category: 'Sweets' },

  // ── Birthday Cakes ────────────────────────────────────────────────────────
  { barcode: 1162, name: 'BIRTHDAY  VANILLA',                   price: 400,  uom: 'Kgs', category: 'Birthday Cakes' },
  { barcode: 1163, name: 'BIRTHDAY FLAVOURS',                   price: 430,  uom: 'Kgs', category: 'Birthday Cakes' },
  { barcode: 1164, name: 'BIRTHDAY PRIME FLAVOURS',             price: 500,  uom: 'Kgs', category: 'Birthday Cakes' },
  { barcode: 1165, name: 'BUTTER CREAM EGGLESS CAKE',           price: 650,  uom: 'Kgs', category: 'Birthday Cakes' },
  { barcode: 1166, name: 'BIRTHDAY PASTRY',                     price: 700,  uom: 'Kgs', category: 'Birthday Cakes' },
  { barcode: 1167, name: 'BIRTHDAY ICE CAKE FLAVOURS',          price: 750,  uom: 'Kgs', category: 'Birthday Cakes' },
  { barcode: 1168, name: 'BIRTHDAY PRIME  ICE CAKE FLAVOURS',   price: 880,  uom: 'Kgs', category: 'Birthday Cakes' },
  { barcode: 1169, name: 'BIRTHDAY FONDANT CAKE',               price: 1400, uom: 'Kgs', category: 'Birthday Cakes' },
  { barcode: 1170, name: 'BUTTER CREAM REDVELVET',              price: 630,  uom: 'Kgs', category: 'Birthday Cakes' },

  // ── Beverages & Others ────────────────────────────────────────────────────
  { barcode: 1171, name: 'WATER 1L',                price: 20,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1172, name: 'WATER 2L',                price: 30,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1173, name: 'GULKAHND 120',            price: 120, uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1174, name: 'GULKAHND 220',            price: 220, uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1175, name: 'DRY FRUITS GULKAND',      price: 250, uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1176, name: 'CHOCOLATE RS 1',          price: 1,   uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1177, name: 'MELODY CHOCOLATATY RS 100',price: 100,uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1178, name: 'PLAIN COVA',              price: 400, uom: 'Kgs', category: 'Beverages & Others' },
  { barcode: 1179, name: 'GOOD DAY 5',              price: 5,   uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1180, name: 'GOOD DAY 10',             price: 10,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1181, name: 'GOOD DAY 20',             price: 20,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1182, name: 'MARIE GOLD 10',           price: 10,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1183, name: 'MARIE GOLD 30',           price: 30,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1184, name: 'MILK BIKIS 10',           price: 10,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1185, name: 'MILK BIKIS 30',           price: 30,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1186, name: '50 50 MASKA CHASKA',      price: 10,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1187, name: 'OREO',                    price: 10,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1188, name: 'NUTRI CHOICE',            price: 25,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1189, name: 'MOMS MAGIC 30',           price: 30,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1190, name: 'MOMS MAGIC 10',           price: 10,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1191, name: 'GOOD DAY NUTS',           price: 80,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1192, name: 'HIDE AND SEEK',           price: 30,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1193, name: 'HIDE AND SEEK VANILLA',   price: 36,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1194, name: 'DARK FANTASY CHOCO FILLS',price: 35,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1195, name: 'KISSAN JAM',              price: 25,  uom: 'Nos', category: 'Beverages & Others' },
  { barcode: 1196, name: 'MUNCH 5',                 price: 5,   uom: 'Nos', category: 'Beverages & Others' },
];

// Branches that use the SNB price list
export const SNB_PRICE_LIST_BRANCHES = ['SNB', 'Hosur'] as const;

// Lookup by barcode
export function getSnbItemByBarcode(barcode: number): SnbItem | undefined {
  return SNB_ITEMS.find((i) => i.barcode === barcode);
}

// Lookup by name (case-insensitive)
export function getSnbItemByName(name: string): SnbItem | undefined {
  const lower = name.toLowerCase().trim();
  return SNB_ITEMS.find((i) => i.name.toLowerCase() === lower);
}
