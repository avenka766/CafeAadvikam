-- Unified live branch catalogue, barcode-safe stock linkage, and recipe metadata.
-- This migration makes SNB/VRSNB items and prices authoritative in Supabase.

create extension if not exists pgcrypto;

create table if not exists public.branch_items (
  branch text not null check (branch in ('SNB','VRSNB')),
  barcode bigint not null,
  name text not null,
  price numeric(14,2) not null check (price > 0),
  uom text not null check (uom in ('Nos','Kgs')),
  category text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by text not null default '',
  primary key (branch, barcode)
);

create unique index if not exists branch_items_name_unique
  on public.branch_items (
    branch,
    lower(regexp_replace(name, '[^a-z0-9]+', '', 'g'))
  );
create index if not exists branch_items_active_idx on public.branch_items(branch, active, category);

insert into public.branch_items (branch, barcode, name, price, uom, category, active, updated_by)
values
('SNB', 1001, 'BUN', 6, 'Nos', 'Bread & Buns', true, 'system-seed'),
('SNB', 1002, 'SPL BUN', 12, 'Nos', 'Bread & Buns', true, 'system-seed'),
('SNB', 1003, 'BREAD', 50, 'Nos', 'Bread & Buns', true, 'system-seed'),
('SNB', 1004, 'WHEAT BREAD', 50, 'Nos', 'Bread & Buns', true, 'system-seed'),
('SNB', 1005, 'Om Sticks (250G)', 70, 'Nos', 'Bread & Buns', true, 'system-seed'),
('SNB', 1006, 'Rusk (250G)', 70, 'Nos', 'Bread & Buns', true, 'system-seed'),
('SNB', 1007, 'MUFFIN', 15, 'Nos', 'Bread & Buns', true, 'system-seed'),
('SNB', 1008, 'NAAN', 50, 'Nos', 'Bread & Buns', true, 'system-seed'),
('SNB', 1009, 'BAKED NIPPAT', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1010, 'PLAIN CAKE', 340, 'Kgs', 'Cakes (by kg)', true, 'system-seed'),
('SNB', 1011, 'FRUIT CAKE', 600, 'Kgs', 'Cakes (by kg)', true, 'system-seed'),
('SNB', 1012, 'BANANA CAKE', 460, 'Kgs', 'Cakes (by kg)', true, 'system-seed'),
('SNB', 1013, 'CARROT CAKE', 460, 'Kgs', 'Cakes (by kg)', true, 'system-seed'),
('SNB', 1014, 'BADAM STICKS', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1015, 'BOURNVITA BISCUIT', 600, 'Kgs', 'Cakes (by kg)', true, 'system-seed'),
('SNB', 1016, 'BUTTER BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1017, 'CASHEW BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1018, 'COCONUT BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1019, 'COCONUT CRUNCH', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1020, 'COCONUT MACAROONS', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1021, 'GINGER COOKIES', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1022, 'GROUNDNUT BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1023, 'HONEY BADAM COOKIES', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1024, 'KARA BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1025, 'MILK BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1026, 'MIX BISCUITS', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1027, 'RAGI BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1028, 'SALT BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1029, 'SPL OM STICKS', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1030, 'SPL RUSK', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1031, 'VANILLA CRUNCH', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1032, 'WHEAT BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1033, 'ZEBRA BISCUIT', 600, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1034, 'MILLETS COOKIES', 700, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1035, 'OATS BISCUITS', 700, 'Kgs', 'Biscuits & Cookies', true, 'system-seed'),
('SNB', 1036, 'SNB CHOCOLATES', 1500, 'Kgs', 'Chocolates', true, 'system-seed'),
('SNB', 1037, 'SNB LOLLIPOP', 15, 'Nos', 'Chocolates', true, 'system-seed'),
('SNB', 1038, 'CHOCOLATE CAKE', 20, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1039, 'CREAM CAKE', 20, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1040, 'HONEY CAKE', 20, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1041, 'SPL BUTTER CREAM CAKE', 30, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1042, 'Brownie Cake', 30, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1043, 'ICE CAKE 60', 60, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1044, 'ICE CAKE 70', 70, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1045, 'ICE CAKE 90', 90, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1046, 'ICE CAKE 100', 100, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1047, 'Double Chocolate', 100, 'Nos', 'Individual Cakes', true, 'system-seed'),
('SNB', 1048, 'CREAM BUN', 20, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1049, 'JAM BUN', 20, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1050, 'DOUGH NUT', 20, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1051, 'Cova Bun', 40, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1052, 'Chocolate Cream Bun', 25, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1053, 'Fruit Cream Bun', 25, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1054, 'DILPASAND', 17.5, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1055, 'SPL DOUGHNUT', 50, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1056, 'VEG PUFF', 20, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1057, 'KACHORI', 15, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1058, 'SAMOSA', 15, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1059, 'PANEER PUFF', 25, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1060, 'KARA BUN', 10, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1061, 'MASALA BUN', 15, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1062, 'BREAD TOAST', 15, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1063, 'VEG ROLL', 25, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1064, 'BURGER', 40, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1065, 'PIZZA', 40, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1066, 'VEG SANDWICH', 40, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1067, 'Veg Cutlet', 18, 'Nos', 'Buns & Pastries', true, 'system-seed'),
('SNB', 1068, 'KARA BOONDHI', 360, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1069, 'BOMBAY MIXTURE', 360, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1070, 'MANGALORE MIXTURE', 360, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1071, 'REGULAR MIXTURE', 360, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1072, 'BERIGAI MIXTURE', 460, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1073, 'RAGI MIXTURE', 400, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1074, 'RINGS', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1075, 'BENNE MURUK', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1076, 'MOTA SEV', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1077, 'CHETTINADU MURUK', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1078, 'RIBBON MURUK', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1079, 'TILL MURUK', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1080, 'OM PUDI', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1081, 'CURRY MURUK', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1082, 'ROUND MURUK', 400, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1083, 'ONION MURUK', 400, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1084, 'Jangiri Muruk', 400, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1085, 'Suthal Muruku', 600, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1086, 'Spl Muruk', 400, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1087, 'MILLET MURUK', 600, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1088, 'PAKODA', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1089, 'BITTER GOURD PAKODA', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1090, 'FINGER CHIPS', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1091, 'PEARL PAKODA', 400, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1092, 'GARLIC NIPPAT', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1093, 'REGULAR NIPPAT', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1094, 'Ragi Nippat', 380, 'Kgs', 'Namkeens & Mixtures', true, 'system-seed'),
('SNB', 1095, 'WHEEL CHIPS', 20, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1096, 'CHIPS', 50, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1097, 'BANANA CHIPS', 60, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1098, 'Chana Dal (250G)', 100, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1099, 'Mix Dal (250G)', 100, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1100, 'Masala Cashew (100G)', 120, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1101, 'Congress (250G)', 100, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1102, 'Sweet Biscuit (250G)', 90, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1103, 'Corn Chips (250G)', 90, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1104, 'Avalakki (250G)', 90, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1105, 'Moong Dal (250G)', 90, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1106, 'Masala Groundnut (250G)', 90, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1107, 'Masala Pori (220G)', 80, 'Nos', 'Packaged Snacks', true, 'system-seed'),
('SNB', 1108, 'BENGALI SWEETS', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1109, 'CASHEW SWEETS', 1000, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1110, 'Anjur Sweets', 1300, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1111, 'KAJU BITE', 1200, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1112, 'MYSORE PAK', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1113, 'BOOST BURFI', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1114, 'HORLICKS BURFI', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1115, 'COCONUT  BURFI', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1116, 'PEDA', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1117, 'THIRUPATHI LAADU', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1118, 'SOAN PAPDI', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1119, 'RAVA LADDU', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1120, 'BOMBAY HALWA', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1121, 'CHANDRAKALA', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1122, 'MINI BADUSHA', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1123, 'HALWA', 600, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1124, 'JANGIRI', 400, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1125, 'JELABI', 360, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1126, 'PEANUT BURFI', 400, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1127, 'TILL BURFI', 400, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1128, 'SWEET BOONDHI', 320, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1129, 'AGRAPAN', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1130, 'BESHAN LADDU', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1131, 'SPL JELABI', 400, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1132, 'JAGGERY COCONUT BURFI', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1133, 'SPL MYSORE PAK', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1134, 'SPL HORLICKS BURFI', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1135, 'SPL BOOST BURFI', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1136, 'SPL MILK MYSOREPAK', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1137, 'SPL MOTI LAADU', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1138, 'SPL PEDA', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1139, 'SPL DATAS BURFI', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1140, 'SPL DATAS LAADU', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1141, 'SPL SOAN PAPDI', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1142, 'SPL CARROT MYSOREPAK', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1143, 'Spl Beetrooth Mysurepak', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1144, 'Spl Lala Mysurepak', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1145, 'MILLET MYSOREPAK', 800, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1146, 'TODAY SPL HALWA', 720, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1147, 'RASAMALAI / MALAIKULLA', 40, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1148, 'JAMOON', 20, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1149, 'OPPAT', 25, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1150, 'PUFFED RICE BALL', 10, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1151, 'POPCORN', 50, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1152, 'MIX CAKE AND PAKODA', 5, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1153, 'Baklava', 1800, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1154, 'MINI CHEESE CAKE', 40, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1155, 'Bread Chilly', 50, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1156, 'Cova Dilpasand', 100, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1157, 'ACHU MURUKKU (125 GMS)', 50, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1158, 'ATHIRASAM', 10, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1159, 'Maddur Vada', 10, 'Nos', 'Sweets', true, 'system-seed'),
('SNB', 1160, 'AVARA MIX DAL', 800, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1161, 'SEDAI', 370, 'Kgs', 'Sweets', true, 'system-seed'),
('SNB', 1162, 'BIRTHDAY  VANILLA', 400, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1163, 'BIRTHDAY FLAVOURS', 430, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1164, 'BIRTHDAY PRIME FLAVOURS', 500, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1165, 'BUTTER CREAM EGGLESS CAKE', 650, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1166, 'BIRTHDAY PASTRY', 700, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1167, 'BIRTHDAY ICE CAKE FLAVOURS', 750, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1168, 'BIRTHDAY PRIME  ICE CAKE FLAVOURS', 880, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1169, 'BIRTHDAY FONDANT CAKE', 1400, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1170, 'BUTTER CREAM REDVELVET', 630, 'Kgs', 'Birthday Cakes', true, 'system-seed'),
('SNB', 1171, 'WATER 1L', 20, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1172, 'WATER 2L', 30, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1173, 'GULKAHND 120', 120, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1174, 'GULKAHND 220', 220, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1175, 'DRY FRUITS GULKAND', 250, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1176, 'CHOCOLATE RS 1', 1, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1177, 'MELODY CHOCOLATATY RS 100', 100, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1178, 'PLAIN COVA', 400, 'Kgs', 'Beverages & Others', true, 'system-seed'),
('SNB', 1179, 'GOOD DAY 5', 5, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1180, 'GOOD DAY 10', 10, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1181, 'GOOD DAY 20', 20, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1182, 'MARIE GOLD 10', 10, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1183, 'MARIE GOLD 30', 30, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1184, 'MILK BIKIS 10', 10, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1185, 'MILK BIKIS 30', 30, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1186, '50 50 MASKA CHASKA', 10, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1187, 'OREO', 10, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1188, 'NUTRI CHOICE', 25, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1189, 'MOMS MAGIC 30', 30, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1190, 'MOMS MAGIC 10', 10, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1191, 'GOOD DAY NUTS', 80, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1192, 'HIDE AND SEEK', 30, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1193, 'HIDE AND SEEK VANILLA', 36, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1194, 'DARK FANTASY CHOCO FILLS', 35, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1195, 'KISSAN JAM', 25, 'Nos', 'Beverages & Others', true, 'system-seed'),
('SNB', 1196, 'MUNCH 5', 5, 'Nos', 'Beverages & Others', true, 'system-seed'),
('VRSNB', 2001, 'Banana chips (200g)', 120, 'Nos', 'CHIPS', true, 'system-seed'),
('VRSNB', 2002, 'Corn chips (200g)', 80, 'Nos', 'CHIPS', true, 'system-seed'),
('VRSNB', 2003, 'Potato chips (150g)', 68, 'Nos', 'CHIPS', true, 'system-seed'),
('VRSNB', 2004, 'Tapico chips (100g)', 60, 'Nos', 'CHIPS', true, 'system-seed'),
('VRSNB', 2005, 'Beetroot muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2006, 'Benne muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2007, 'Chettinadu muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2008, 'Garlic muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2009, 'Gavani rice muruk (200g)', 120, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2010, 'Kaisuthal muruk (200g)', 120, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2011, 'Kambu muruk (200g)', 120, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2012, 'Masala groundnut (200g)', 80, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2013, 'Mullu muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2014, 'Onion rings (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2015, 'Ragi muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2016, 'Red rice muruk (200g)', 120, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2017, 'Rings (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2018, 'Samai muruk (200g)', 88, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2019, 'Seedai (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2020, 'Thenkuzhal salt muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2021, 'Thenkuzhal masala muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2022, 'Till muruk (200g)', 80, 'Nos', 'MURUK', true, 'system-seed'),
('VRSNB', 2023, 'Avalakki mixture (200g)', 90, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2024, 'Spl Berigai mixture (200g)', 90, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2025, 'Bombay mixture (200g)', 80, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2026, 'Masala cashew (100g)', 120, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2027, 'Pepper cashew (100g)', 120, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2028, 'Dryfruit mixture (200g)', 120, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2029, 'Kara boondhi (200g)', 80, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2030, 'Kara sev (200g)', 80, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2031, 'Mangalore mixture (200g)', 80, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2032, 'Om pudi (200g)', 80, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2033, 'Pudhina mixture (200g)', 88, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2034, 'Ragi mixture (200g)', 88, 'Nos', 'MIXTURE', true, 'system-seed'),
('VRSNB', 2035, 'Cashew pakoda (200g)', 80, 'Nos', 'PAKODA', true, 'system-seed'),
('VRSNB', 2036, 'Pearl onion pakoda (200g)', 80, 'Nos', 'PAKODA', true, 'system-seed'),
('VRSNB', 2037, 'Garlic nippat (200g)', 80, 'Nos', 'NIPPAT', true, 'system-seed'),
('VRSNB', 2038, 'Pepper nippat (200g)', 80, 'Nos', 'NIPPAT', true, 'system-seed'),
('VRSNB', 2039, 'Ragi nippat (200g)', 80, 'Nos', 'NIPPAT', true, 'system-seed'),
('VRSNB', 2040, 'Regular nippat (200g)', 80, 'Nos', 'NIPPAT', true, 'system-seed'),
('VRSNB', 2041, 'Avalakki (200g)', 80, 'Nos', 'DAL', true, 'system-seed'),
('VRSNB', 2042, 'Congress (200g)', 80, 'Nos', 'DAL', true, 'system-seed'),
('VRSNB', 2043, 'Masala pori (200g)', 80, 'Nos', 'DAL', true, 'system-seed'),
('VRSNB', 2044, 'Mix dal (200g)', 100, 'Nos', 'DAL', true, 'system-seed'),
('VRSNB', 2045, 'Moong dal (200g)', 80, 'Nos', 'DAL', true, 'system-seed'),
('VRSNB', 2046, 'Bread', 50, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2047, 'Bun', 36, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2048, 'Cova bun', 50, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2049, 'Dilpasand', 70, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2050, 'Om stick', 65, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2051, 'Rusk', 70, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2052, 'Spl bun', 50, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2053, 'Badam milk cool', 60, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2054, 'Elaneer payasam', 60, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2055, 'Rose milk cool', 60, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2056, 'Veg puff', 20, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2057, 'Samosa', 15, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2058, 'Paneer puff', 25, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2059, 'Veg roll', 25, 'Nos', 'BAKERY', true, 'system-seed'),
('VRSNB', 2060, 'Banana cake', 50, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2061, 'Berry blast (Strawberry, Blueberry)', 900, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2062, 'Birthday cake', 400, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2063, 'Birthday flavour', 430, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2064, 'Birthday prime flavour', 500, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2065, 'Black current', 900, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2066, 'Black forest', 800, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2067, 'Black nutty bubble', 1000, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2068, 'Brownie 30', 30, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2069, 'Brownie 40', 40, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2070, 'Butterscotch cake', 900, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2071, 'Choco truffle cake', 800, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2072, 'Chocolate pc cake', 20, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2073, 'Chocolate cake', 500, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2074, 'Cream pc cake', 20, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2075, 'Donut', 50, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2076, 'Double chocolate cake', 800, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2077, 'Honey pc cake', 20, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2078, 'Ice cake 100', 100, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2079, 'Ice cake 50', 50, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2080, 'Jam burger', 30, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2081, 'Mango cake', 900, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2082, 'Milk ice pc cake', 100, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2083, 'Muffin', 30, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2084, 'Nutty bubble', 1000, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2085, 'Pineapple belight', 900, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2086, 'Plain cake', 340, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2087, 'Rasamalai cake', 1000, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2088, 'Spl butter cream pc cake', 30, 'Nos', 'CAKE', true, 'system-seed'),
('VRSNB', 2089, 'White forest cake', 800, 'Kgs', 'CAKE', true, 'system-seed'),
('VRSNB', 2090, 'Badam sticks', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2091, 'Bournvita biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2092, 'Butter biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2093, 'Coconut biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2094, 'Coconut crunch', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2095, 'Groundnut biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2096, 'Honey badam cookies', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2097, 'Kara biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2098, 'Milk biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2099, 'Millet cookies', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2100, 'Oats cookies', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2101, 'Ragi biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2102, 'Salt biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2103, 'Spl cookies', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2104, 'Spl om sticks', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2105, 'Spl rusk', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2106, 'Vanilla crunch', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2107, 'Wheat biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2108, 'Zebra biscuit', 130, 'Nos', 'COOKIES', true, 'system-seed'),
('VRSNB', 2109, 'Black grapes halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2110, 'Black rice halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2111, 'Carrot halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2112, 'Dom rotti halwa', 60, 'Nos', 'HALWA', true, 'system-seed'),
('VRSNB', 2113, 'Elaneer halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2114, 'Papaya halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2115, 'Paruthi pal halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2116, 'Pumpkin halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2117, 'Watermelon halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2118, 'Wheat halwa', 700, 'Kgs', 'HALWA', true, 'system-seed'),
('VRSNB', 2119, 'Gulab jamun', 25, 'Nos', 'JAMUN', true, 'system-seed'),
('VRSNB', 2120, 'Kala jamun', 25, 'Nos', 'JAMUN', true, 'system-seed'),
('VRSNB', 2121, 'Kesar jamun', 25, 'Nos', 'JAMUN', true, 'system-seed'),
('VRSNB', 2122, 'Makkan peda', 25, 'Nos', 'JAMUN', true, 'system-seed'),
('VRSNB', 2123, 'Mini jamun', 600, 'Kgs', 'JAMUN', true, 'system-seed'),
('VRSNB', 2124, 'Rabdi', 45, 'Nos', 'JAMUN', true, 'system-seed'),
('VRSNB', 2125, 'Rasamalai / Malaikulla', 40, 'Nos', 'JAMUN', true, 'system-seed'),
('VRSNB', 2126, 'Beetroot mysore pak', 700, 'Kgs', 'MYSORE PAK', true, 'system-seed'),
('VRSNB', 2127, 'Butter mysore pak', 700, 'Kgs', 'MYSORE PAK', true, 'system-seed'),
('VRSNB', 2128, 'Carrot mysore pak', 700, 'Kgs', 'MYSORE PAK', true, 'system-seed'),
('VRSNB', 2129, 'Karupatti mysore pak', 700, 'Kgs', 'MYSORE PAK', true, 'system-seed'),
('VRSNB', 2130, 'Milk cake', 700, 'Kgs', 'MYSORE PAK', true, 'system-seed'),
('VRSNB', 2131, 'Baklawa almond', 1400, 'Kgs', 'BAKLAVA', true, 'system-seed'),
('VRSNB', 2132, 'Cashew asabi', 1400, 'Kgs', 'BAKLAVA', true, 'system-seed'),
('VRSNB', 2133, 'Crown baklava', 1400, 'Kgs', 'BAKLAVA', true, 'system-seed'),
('VRSNB', 2134, 'Pista baklawa', 1400, 'Kgs', 'BAKLAVA', true, 'system-seed'),
('VRSNB', 2135, 'American dates roll', 1100, 'Kgs', 'CASHEW SWEETS', true, 'system-seed'),
('VRSNB', 2136, 'American dryfruit burfi', 1100, 'Kgs', 'CASHEW SWEETS', true, 'system-seed'),
('VRSNB', 2137, 'Anjur sweets', 1100, 'Kgs', 'CASHEW SWEETS', true, 'system-seed'),
('VRSNB', 2138, 'Chocolate wafer munch', 1100, 'Kgs', 'CASHEW SWEETS', true, 'system-seed'),
('VRSNB', 2139, 'Kaju katli', 1100, 'Kgs', 'CASHEW SWEETS', true, 'system-seed'),
('VRSNB', 2140, 'Vanilla wafer munch', 1100, 'Kgs', 'CASHEW SWEETS', true, 'system-seed'),
('VRSNB', 2141, 'Butterscotch cashew biscuit', 1100, 'Kgs', 'CASHEW BISCUIT', true, 'system-seed'),
('VRSNB', 2142, 'Choco cashew biscuit', 1100, 'Kgs', 'CASHEW BISCUIT', true, 'system-seed'),
('VRSNB', 2143, 'Dryfruit punch', 1100, 'Kgs', 'CASHEW BISCUIT', true, 'system-seed'),
('VRSNB', 2144, 'Dry rose cashew biscuit', 1100, 'Kgs', 'CASHEW BISCUIT', true, 'system-seed'),
('VRSNB', 2145, 'Kesar cashew biscuit', 1100, 'Kgs', 'CASHEW BISCUIT', true, 'system-seed'),
('VRSNB', 2146, 'Mango cashew biscuit', 1100, 'Kgs', 'CASHEW BISCUIT', true, 'system-seed'),
('VRSNB', 2147, 'Pista cashew biscuit', 1100, 'Kgs', 'CASHEW BISCUIT', true, 'system-seed'),
('VRSNB', 2148, 'Walnut cashew biscuit', 1100, 'Kgs', 'CASHEW BISCUIT', true, 'system-seed'),
('VRSNB', 2149, 'Orange cashew cake roll', 1100, 'Kgs', 'CAKE ROLL', true, 'system-seed'),
('VRSNB', 2150, 'Vanilla cashew cake roll', 1100, 'Kgs', 'CAKE ROLL', true, 'system-seed'),
('VRSNB', 2151, 'Dry seeds burfi', 1100, 'Kgs', 'BURFI', true, 'system-seed'),
('VRSNB', 2152, 'Mango burfi', 700, 'Kgs', 'BURFI', true, 'system-seed'),
('VRSNB', 2153, 'Mix millet burfi', 700, 'Kgs', 'BURFI', true, 'system-seed'),
('VRSNB', 2154, 'Orange ice cream burfi', 700, 'Kgs', 'BURFI', true, 'system-seed'),
('VRSNB', 2155, 'Red velvet burfi', 700, 'Kgs', 'BURFI', true, 'system-seed'),
('VRSNB', 2156, 'Solamavu burfi', 700, 'Kgs', 'BURFI', true, 'system-seed'),
('VRSNB', 2157, 'Thinnai burfi', 700, 'Kgs', 'BURFI', true, 'system-seed'),
('VRSNB', 2158, 'Vanilla burfi', 700, 'Kgs', 'BURFI', true, 'system-seed'),
('VRSNB', 2159, 'Chocolate peda', 700, 'Kgs', 'PEDA', true, 'system-seed'),
('VRSNB', 2160, 'Kesar peda', 700, 'Kgs', 'PEDA', true, 'system-seed'),
('VRSNB', 2161, 'Madura peda', 700, 'Kgs', 'PEDA', true, 'system-seed'),
('VRSNB', 2162, 'Milk peda', 700, 'Kgs', 'PEDA', true, 'system-seed'),
('VRSNB', 2163, 'Dryfruit laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2164, 'Ghee laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2165, 'Karupatti laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2166, 'Karupu ulundha laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2167, 'Kollu laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2168, 'Pasi parupu laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2169, 'Ragi laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2170, 'Spl thirupathi laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2171, 'Yellu laddu', 700, 'Kgs', 'LADDU', true, 'system-seed'),
('VRSNB', 2172, 'Badam cashew laddu', 1200, 'Kgs', 'CASHEW LADDU', true, 'system-seed'),
('VRSNB', 2173, 'Choco cashew laddu', 1200, 'Kgs', 'CASHEW LADDU', true, 'system-seed'),
('VRSNB', 2174, 'Dry rose cashew laddu', 1200, 'Kgs', 'CASHEW LADDU', true, 'system-seed'),
('VRSNB', 2175, 'Pista cashew laddu', 1200, 'Kgs', 'CASHEW LADDU', true, 'system-seed'),
('VRSNB', 2176, 'Rice ball cashew laddu', 1200, 'Kgs', 'CASHEW LADDU', true, 'system-seed'),
('VRSNB', 2177, 'Mix burfi', 700, 'Kgs', 'MIX', true, 'system-seed'),
('VRSNB', 2178, 'Mix cashew laddu', 1200, 'Kgs', 'MIX', true, 'system-seed'),
('VRSNB', 2179, 'Mix cashew biscuit & sweets', 1100, 'Kgs', 'MIX', true, 'system-seed'),
('VRSNB', 2180, 'Mix laddu', 700, 'Kgs', 'MIX', true, 'system-seed'),
('VRSNB', 2181, 'Mix peda', 700, 'Kgs', 'MIX', true, 'system-seed'),
('VRSNB', 2182, 'Mix spl mysore pak', 800, 'Kgs', 'MIX', true, 'system-seed'),
('VRSNB', 2183, 'Mix spl sweets', 700, 'Kgs', 'MIX', true, 'system-seed'),
('VRSNB', 2184, 'SNB chocolate', 1500, 'Kgs', 'CHOCOLATE', true, 'system-seed'),
('VRSNB', 2185, 'SNB lollipop', 15, 'Nos', 'CHOCOLATE', true, 'system-seed'),
('VRSNB', 2186, 'Agrapan', 700, 'Kgs', 'SWEETS', true, 'system-seed'),
('VRSNB', 2187, 'Athirasam', 10, 'Nos', 'SWEETS', true, 'system-seed'),
('VRSNB', 2188, 'Bengali sweets', 700, 'Kgs', 'SWEETS', true, 'system-seed'),
('VRSNB', 2189, 'Jalebi', 400, 'Kgs', 'SWEETS', true, 'system-seed'),
('VRSNB', 2190, 'Jangiri', 400, 'Kgs', 'SWEETS', true, 'system-seed'),
('VRSNB', 2191, 'Mini badusha', 580, 'Kgs', 'SWEETS', true, 'system-seed'),
('VRSNB', 2192, 'Oppat', 20, 'Nos', 'SWEETS', true, 'system-seed'),
('VRSNB', 2193, 'Soan papdi', 700, 'Kgs', 'SWEETS', true, 'system-seed'),
('VRSNB', 2194, 'Badam mysore pak', 800, 'Kgs', 'SPL SWEETS', true, 'system-seed'),
('VRSNB', 2195, 'Cashew mysore pak', 800, 'Kgs', 'SPL SWEETS', true, 'system-seed'),
('VRSNB', 2196, 'Kambu mysore pak', 800, 'Kgs', 'SPL SWEETS', true, 'system-seed'),
('VRSNB', 2197, 'Kollu mysore pak', 800, 'Kgs', 'SPL SWEETS', true, 'system-seed'),
('VRSNB', 2198, 'Pacha payir mysore pak', 800, 'Kgs', 'SPL SWEETS', true, 'system-seed'),
('VRSNB', 2199, 'Pista mysore pak', 800, 'Kgs', 'SPL SWEETS', true, 'system-seed')
on conflict (branch, barcode) do nothing;

do $$
begin
  if to_regclass('public.branch_item_prices') is not null then
    execute $sql$
      update public.branch_items bi
      set name = p.name,
          price = p.price,
          updated_at = coalesce(p.updated_at, now()),
          updated_by = coalesce(p.updated_by, '')
      from public.branch_item_prices p
      where p.branch = bi.branch and p.barcode = bi.barcode
    $sql$;
  end if;
end $$;

create table if not exists public.branch_item_changes (
  id uuid primary key default gen_random_uuid(),
  branch text not null,
  barcode bigint not null,
  old_name text,
  new_name text,
  old_price numeric(14,2),
  new_price numeric(14,2),
  old_uom text,
  new_uom text,
  old_category text,
  new_category text,
  changed_by text not null default '',
  changed_at timestamptz not null default now()
);

alter table if exists public.branch_stock add column if not exists item_barcode bigint;
alter table if exists public.branch_sales add column if not exists item_barcode bigint;
alter table if exists public.branch_incoming add column if not exists item_barcode bigint;
alter table if exists public.branch_stock_mismatches add column if not exists item_barcode bigint;
alter table if exists public.branch_thresholds add column if not exists item_barcode bigint;

update public.branch_stock bs
set item_barcode = bi.barcode
from public.branch_items bi
where bs.branch = bi.branch
  and bs.item_barcode is null
  and lower(regexp_replace(bs.item_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(bi.name, '[^a-z0-9]+', '', 'g'));

update public.branch_thresholds bt
set item_barcode = bi.barcode
from public.branch_items bi
where bt.branch = bi.branch
  and bt.item_barcode is null
  and lower(regexp_replace(bt.item_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(bi.name, '[^a-z0-9]+', '', 'g'));

update public.branch_sales bs
set item_barcode = bi.barcode
from public.branch_items bi
where (bs.branch = bi.branch or (bs.branch = 'Hosur' and bi.branch = 'SNB'))
  and bs.item_barcode is null
  and lower(regexp_replace(bs.item_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(bi.name, '[^a-z0-9]+', '', 'g'));

update public.branch_incoming incoming
set item_barcode = bi.barcode
from public.branch_items bi
where (incoming.branch = bi.branch or (incoming.branch = 'Hosur' and bi.branch = 'SNB'))
  and incoming.item_barcode is null
  and lower(regexp_replace(incoming.item_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(bi.name, '[^a-z0-9]+', '', 'g'));

update public.branch_stock_mismatches mismatch
set item_barcode = bi.barcode
from public.branch_items bi
where (mismatch.branch = bi.branch or (mismatch.branch = 'Hosur' and bi.branch = 'SNB'))
  and mismatch.item_barcode is null
  and lower(regexp_replace(mismatch.item_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(bi.name, '[^a-z0-9]+', '', 'g'));

-- Hosur uses the SNB catalogue but keeps independent stock rows.
update public.branch_stock bs
set item_barcode = bi.barcode
from public.branch_items bi
where bs.branch = 'Hosur' and bi.branch = 'SNB'
  and bs.item_barcode is null
  and lower(regexp_replace(bs.item_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(bi.name, '[^a-z0-9]+', '', 'g'));

update public.branch_thresholds bt
set item_barcode = bi.barcode
from public.branch_items bi
where bt.branch = 'Hosur' and bi.branch = 'SNB'
  and bt.item_barcode is null
  and lower(regexp_replace(bt.item_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(bi.name, '[^a-z0-9]+', '', 'g'));

create index if not exists branch_stock_barcode_idx on public.branch_stock(branch, item_barcode);
create index if not exists branch_sales_barcode_idx on public.branch_sales(branch, item_barcode);
create index if not exists branch_thresholds_barcode_idx on public.branch_thresholds(branch, item_barcode);
create index if not exists branch_incoming_barcode_idx on public.branch_incoming(branch, item_barcode);
create index if not exists branch_stock_mismatches_barcode_idx on public.branch_stock_mismatches(branch, item_barcode);

create or replace function public.create_branch_item(
  p_branch text,
  p_name text,
  p_price numeric,
  p_uom text,
  p_category text,
  p_updated_by text default ''
)
returns public.branch_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_barcode bigint;
  v_row public.branch_items;
  v_start bigint;
begin
  if p_branch not in ('SNB','VRSNB') then raise exception 'Invalid branch'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Item name is required'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_uom not in ('Nos','Kgs') then raise exception 'Invalid unit'; end if;

  perform pg_advisory_xact_lock(hashtext('branch-items-' || p_branch));
  v_start := case when p_branch = 'SNB' then 1000 else 2000 end;
  select greatest(v_start, coalesce(max(barcode), v_start)) + 1
    into v_barcode from public.branch_items where branch = p_branch;

  insert into public.branch_items(branch, barcode, name, price, uom, category, active, updated_by)
  values(p_branch, v_barcode, trim(p_name), p_price, p_uom, trim(p_category), true, coalesce(p_updated_by, ''))
  returning * into v_row;

  insert into public.branch_stock(branch, item_name, item_barcode, quantity, unit, min_threshold)
  values(
    p_branch,
    v_row.name,
    v_row.barcode,
    0,
    case when v_row.uom = 'Kgs' then 'kg' else 'pcs' end,
    case when v_row.uom = 'Kgs' then 2 else 10 end
  )
  on conflict do nothing;

  return v_row;
end $$;

create or replace function public.update_branch_item(
  p_branch text,
  p_barcode bigint,
  p_name text,
  p_price numeric,
  p_uom text,
  p_category text,
  p_active boolean,
  p_updated_by text default ''
)
returns public.branch_items
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old public.branch_items;
  v_new public.branch_items;
begin
  select * into v_old
  from public.branch_items
  where branch = p_branch and barcode = p_barcode
  for update;
  if not found then raise exception 'Item not found'; end if;
  if nullif(trim(p_name), '') is null then raise exception 'Item name is required'; end if;
  if p_price is null or p_price <= 0 then raise exception 'Price must be greater than zero'; end if;
  if p_uom not in ('Nos','Kgs') then raise exception 'Invalid unit'; end if;

  update public.branch_items
  set name = trim(p_name),
      price = p_price,
      uom = p_uom,
      category = trim(p_category),
      active = coalesce(p_active, true),
      updated_at = now(),
      updated_by = coalesce(p_updated_by, '')
  where branch = p_branch and barcode = p_barcode
  returning * into v_new;

  insert into public.branch_item_changes(
    branch, barcode, old_name, new_name, old_price, new_price,
    old_uom, new_uom, old_category, new_category, changed_by
  ) values(
    p_branch, p_barcode, v_old.name, v_new.name, v_old.price, v_new.price,
    v_old.uom, v_new.uom, v_old.category, v_new.category, coalesce(p_updated_by, '')
  );

  update public.branch_stock
  set item_name = v_new.name,
      item_barcode = v_new.barcode,
      unit = case when v_new.uom = 'Kgs' then 'kg' else 'pcs' end
  where branch = p_branch
    and (item_barcode = p_barcode or (
      item_barcode is null and
      lower(regexp_replace(item_name, '[^a-z0-9]+', '', 'g'))
        = lower(regexp_replace(v_old.name, '[^a-z0-9]+', '', 'g'))
    ));

  update public.branch_thresholds
  set item_name = v_new.name,
      item_barcode = v_new.barcode
  where branch = p_branch
    and (item_barcode = p_barcode or (
      item_barcode is null and
      lower(regexp_replace(item_name, '[^a-z0-9]+', '', 'g'))
        = lower(regexp_replace(v_old.name, '[^a-z0-9]+', '', 'g'))
    ));

  return v_new;
end $$;

create or replace function public.decrement_branch_stock_by_barcode_strict(
  p_branch text,
  p_barcode bigint,
  p_qty numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_qty numeric;
  v_item public.branch_items;
  v_catalog_branch text := case when p_branch = 'Hosur' then 'SNB' else p_branch end;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  select * into v_item from public.branch_items
  where branch = v_catalog_branch and barcode = p_barcode and active = true;
  if not found then raise exception 'Active item not found'; end if;

  perform pg_advisory_xact_lock(hashtext('branch-stock-' || p_branch || '-' || p_barcode::text));

  update public.branch_stock
  set item_barcode = p_barcode, item_name = v_item.name
  where branch = p_branch and item_barcode is null
    and lower(regexp_replace(item_name, '[^a-z0-9]+', '', 'g'))
      = lower(regexp_replace(v_item.name, '[^a-z0-9]+', '', 'g'));

  update public.branch_stock
  set quantity = round((quantity - p_qty)::numeric, 3),
      item_name = v_item.name
  where branch = p_branch and item_barcode = p_barcode and quantity >= p_qty
  returning quantity into v_new_qty;

  return v_new_qty;
end $$;

create or replace function public.increment_branch_stock_by_barcode(
  p_branch text,
  p_barcode bigint,
  p_qty numeric
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_new_qty numeric;
  v_item public.branch_items;
  v_catalog_branch text := case when p_branch = 'Hosur' then 'SNB' else p_branch end;
begin
  if p_qty is null or p_qty <= 0 then raise exception 'Quantity must be greater than zero'; end if;
  select * into v_item from public.branch_items where branch = v_catalog_branch and barcode = p_barcode;
  if not found then raise exception 'Item not found'; end if;

  perform pg_advisory_xact_lock(hashtext('branch-stock-' || p_branch || '-' || p_barcode::text));

  update public.branch_stock
  set quantity = round((quantity + p_qty)::numeric, 3),
      item_name = v_item.name,
      item_barcode = p_barcode,
      unit = case when v_item.uom = 'Kgs' then 'kg' else 'pcs' end
  where branch = p_branch and item_barcode = p_barcode
  returning quantity into v_new_qty;

  if v_new_qty is null then
    insert into public.branch_stock(branch, item_name, item_barcode, quantity, unit, min_threshold)
    values(
      p_branch, v_item.name, p_barcode, round(p_qty::numeric, 3),
      case when v_item.uom = 'Kgs' then 'kg' else 'pcs' end,
      case when v_item.uom = 'Kgs' then 2 else 10 end
    )
    returning quantity into v_new_qty;
  end if;

  return v_new_qty;
end $$;

create or replace function public.confirm_incoming_stock_canonical(
  p_incoming_id uuid,
  p_branch text
)
returns numeric
language plpgsql
security definer
set search_path = public
as $$
declare
  v_incoming public.branch_incoming;
  v_barcode bigint;
  v_new_qty numeric;
  v_catalog_branch text := case when p_branch = 'Hosur' then 'SNB' else p_branch end;
begin
  select * into v_incoming
  from public.branch_incoming
  where id = p_incoming_id and branch = p_branch
  for update;
  if not found then raise exception 'Incoming stock not found'; end if;
  if coalesce(v_incoming.disputed, false) then raise exception 'Incoming stock is disputed'; end if;
  if coalesce(v_incoming.confirmed, false) then
    select quantity into v_new_qty from public.branch_stock
    where branch = p_branch and (
      (v_incoming.item_barcode is not null and item_barcode = v_incoming.item_barcode)
      or (v_incoming.item_barcode is null and item_name = v_incoming.item_name)
    ) limit 1;
    return v_new_qty;
  end if;

  v_barcode := v_incoming.item_barcode;
  if v_barcode is null then
    select barcode into v_barcode from public.branch_items
    where branch = v_catalog_branch
      and lower(regexp_replace(name, '[^a-z0-9]+', '', 'g'))
        = lower(regexp_replace(v_incoming.item_name, '[^a-z0-9]+', '', 'g'))
    limit 1;
  end if;
  if v_barcode is null then raise exception 'Incoming item is not linked to the branch catalogue'; end if;

  v_new_qty := public.increment_branch_stock_by_barcode(p_branch, v_barcode, v_incoming.quantity);
  update public.branch_incoming
  set confirmed = true, item_barcode = v_barcode
  where id = p_incoming_id;
  return v_new_qty;
end $$;

create or replace function public.canonicalize_branch_sale_items(
  p_branch text,
  p_items jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_result jsonb;
  v_requested_count integer;
  v_resolved_count integer;
  v_catalog_branch text := case when p_branch = 'Hosur' then 'SNB' else p_branch end;
begin
  if jsonb_typeof(p_items) <> 'array' then raise exception 'Items must be an array'; end if;
  v_requested_count := jsonb_array_length(p_items);

  with requested as (
    select
      nullif(x->>'barcode','')::bigint as barcode,
      nullif(x->>'quantity','')::numeric as quantity,
      coalesce(nullif(x->>'discount','')::numeric, 0) as discount,
      coalesce(nullif(x->>'tax','')::numeric, 0) as tax
    from jsonb_array_elements(p_items) x
  ), resolved as (
    select
      bi.barcode,
      bi.name,
      bi.price,
      bi.uom,
      bi.category,
      r.quantity,
      r.discount,
      r.tax
    from requested r
    join public.branch_items bi
      on bi.branch = v_catalog_branch and bi.barcode = r.barcode and bi.active = true
    where r.quantity > 0
  )
  select
    coalesce(jsonb_agg(jsonb_build_object(
      'barcode', barcode,
      'itemName', name,
      'quantity', quantity,
      'unit', case when uom = 'Kgs' then 'kg' else 'pcs' end,
      'price', price,
      'discount', discount,
      'tax', tax,
      'lineTotal', round((price * quantity + tax - discount)::numeric, 2)
    ) order by barcode), '[]'::jsonb),
    count(*)
  into v_result, v_resolved_count
  from resolved;

  if v_resolved_count <> v_requested_count then
    raise exception 'One or more items are inactive, missing, or have an invalid quantity';
  end if;
  return v_result;
end $$;


-- Server-side wrapper: never allow a cashier client to choose item names or prices.
-- The existing complete_branch_checkout RPC remains the atomic writer; this wrapper
-- resolves every line from branch_items immediately before invoking it.
create or replace function public.complete_branch_checkout_canonical(
  p_branch text,
  p_items jsonb,
  p_payments jsonb,
  p_customer_name text default null,
  p_customer_phone text default null,
  p_salesperson text default null,
  p_biller text default null,
  p_discount numeric default 0,
  p_tax numeric default 0,
  p_round_off numeric default 0,
  p_payment_type text default 'counter',
  p_due_date text default null,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_canonical jsonb;
  v_result jsonb;
  v_subtotal numeric;
  v_tax numeric;
begin
  if p_branch not in ('SNB','VRSNB','Hosur') then raise exception 'Invalid branch'; end if;
  if coalesce(p_discount, 0) < 0 then raise exception 'Discount cannot be negative'; end if;
  if coalesce(p_round_off, 0) < -1 or coalesce(p_round_off, 0) > 1 then raise exception 'Invalid round off'; end if;

  v_canonical := public.canonicalize_branch_sale_items(p_branch, p_items);
  select coalesce(sum((line->>'price')::numeric * (line->>'quantity')::numeric), 0),
         coalesce(sum(coalesce((line->>'tax')::numeric, 0)), 0)
    into v_subtotal, v_tax
  from jsonb_array_elements(v_canonical) line;
  if coalesce(p_discount, 0) > v_subtotal + v_tax then raise exception 'Discount exceeds bill value'; end if;
  if round(coalesce(p_tax, 0), 2) <> round(v_tax, 2) then raise exception 'Tax changed; refresh the cart'; end if;

  begin
    execute $call$
      select to_jsonb(public.complete_branch_checkout(
        $1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,
        case when $12 is null or $12 = '' then null else $12::date end,
        $13
      ))
    $call$
    using p_branch, v_canonical, p_payments, p_customer_name, p_customer_phone,
          p_salesperson, p_biller, coalesce(p_discount,0), v_tax,
          coalesce(p_round_off,0), p_payment_type, p_due_date, p_notes
    into v_result;
  exception when undefined_function then
    raise exception 'Atomic complete_branch_checkout RPC is not installed';
  end;
  return v_result;
end $$;

alter table if exists public.bakery_recipes add column if not exists updated_at timestamptz not null default now();
alter table if exists public.bakery_recipes add column if not exists updated_by text not null default '';

do $$
begin
  begin alter publication supabase_realtime add table public.branch_items; exception when duplicate_object then null; end;
  begin alter publication supabase_realtime add table public.bakery_recipes; exception when duplicate_object then null; end;
end $$;

grant select, insert, update on public.branch_items to anon, authenticated;
grant select, insert on public.branch_item_changes to anon, authenticated;
grant execute on function public.create_branch_item(text,text,numeric,text,text,text) to anon, authenticated;
grant execute on function public.update_branch_item(text,bigint,text,numeric,text,text,boolean,text) to anon, authenticated;
grant execute on function public.decrement_branch_stock_by_barcode_strict(text,bigint,numeric) to anon, authenticated;
grant execute on function public.increment_branch_stock_by_barcode(text,bigint,numeric) to anon, authenticated;
grant execute on function public.confirm_incoming_stock_canonical(uuid,text) to anon, authenticated;
grant execute on function public.canonicalize_branch_sale_items(text,jsonb) to anon, authenticated;
grant execute on function public.complete_branch_checkout_canonical(text,jsonb,jsonb,text,text,text,text,numeric,numeric,numeric,text,text,text) to anon, authenticated;
