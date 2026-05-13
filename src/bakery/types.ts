// src/bakery/types.ts  ← REPLACE EXISTING FILE

export type BakeryRole = 'order_receiver' | 'store' | 'baker' | 'packing';

export type WorkflowStatus = 'pending' | 'processing' | 'baking' | 'packed' | 'dispatched';

export interface BakeryOrderItem {
  itemId: string;
  itemName: string;
  quantity: number;       // always in kg (for VRSNB Nos items, already converted) or natural unit
  isCustom?: boolean;
  /** VRSNB Nos items: the raw pcs count the receiver entered before conversion */
  originalPcs?: number;
  /** VRSNB Nos items: per-unit weight in grams used for the pcs→kg conversion */
  weightGrams?: number;
}

export interface BakeryOrder {
  id: string;
  orderNumber: number;
  items: BakeryOrderItem[];
  status: WorkflowStatus;
  createdBy: string;
  createdAt: string;
  expectedOutput?: number;
  materialsCalculatedAt?: string;
  preparedItems?: PreparedItem[];
  sentToPackingAt?: string;
  dispatchLog?: DispatchEntry[];
  targetBranch?: Branch;
}

export interface PreparedItem {
  itemId: string;
  itemName: string;
  quantityPrepared: number;
  preparedAt: string;
}

export interface DispatchEntry {
  id: string;
  itemName: string;
  quantity: number;
  branch: Branch;
  dispatchedAt: string;
  dispatchedBy: string;
}

export type Branch = 'VRSNB' | 'SNB' | 'Hosur';

export interface MaterialRequirement {
  material: string;
  quantity: number;
  unit: string;
}

// ─── ALL BAKERY ITEMS (from product sheets) ──────────────────────────────────
export const BAKERY_ITEMS: { id: string; name: string; icon: string; category: string }[] = [

  // ── SWEETS ────────────────────────────────────────────────────────────────
  { id: 'mysore-pak',                   name: 'Mysore Pak',                      icon: '🍬', category: 'Sweets' },
  { id: 'spl-mysore-pak',               name: 'Spl Mysore Pak',                  icon: '🍬', category: 'Sweets' },
  { id: 'spl-carrot-mysore-pak',        name: 'Spl Carrot Mysore Pak',           icon: '🍬', category: 'Sweets' },
  { id: 'spl-beetroot-mysore-pak',      name: 'Spl Beetroot Mysore Pak',         icon: '🍬', category: 'Sweets' },
  { id: 'ragi-mysore-pak',              name: 'Ragi Mysore Pak',                 icon: '🍬', category: 'Sweets' },
  { id: 'kampu-mysore-pak',             name: 'Kampu Mysore Pak',                icon: '🍬', category: 'Sweets' },
  { id: 'jaggery-kambu-mysore-pak',     name: 'Jaggery Kambu Mysore Pak',        icon: '🍬', category: 'Sweets' },
  { id: 'thinai-mysore-pak',            name: 'Thinai Mysore Pak',               icon: '🍬', category: 'Sweets' },
  { id: 'spl-milk-mysore-pak',          name: 'Spl Milk Mysore Pak',             icon: '🍬', category: 'Sweets' },
  { id: 'lala-mysore-pak',              name: 'Lala Mysore Pak',                 icon: '🍬', category: 'Sweets' },
  { id: 'millet-mix-mysore-pak',        name: 'Millet Mix Mysore Pak',           icon: '🍬', category: 'Sweets' },
  { id: 'sammai-millet-burfi',          name: 'Sammai Millet Burfi',             icon: '🍬', category: 'Sweets' },
  { id: 'ragi-millet-burfi',            name: 'Ragi Millet Burfi',               icon: '🍬', category: 'Sweets' },
  { id: 'thinai-millet-burfi',          name: 'Thinai Millet Burfi',             icon: '🍬', category: 'Sweets' },
  { id: 'boost-burfi',                  name: 'Boost Burfi',                     icon: '🍬', category: 'Sweets' },
  { id: 'spl-boost-burfi',              name: 'Spl Boost Burfi',                 icon: '🍬', category: 'Sweets' },
  { id: 'horlicks-burfi',               name: 'Horlicks Burfi',                  icon: '🍬', category: 'Sweets' },
  { id: 'spl-horlicks-burfi',           name: 'Spl Horlicks Burfi',              icon: '🍬', category: 'Sweets' },
  { id: 'coconut-burfi',                name: 'Coconut Burfi',                   icon: '🍬', category: 'Sweets' },
  { id: 'spl-jaggery-coconut-burfi',    name: 'Spl Jaggery Coconut Burfi',       icon: '🍬', category: 'Sweets' },
  { id: 'peanut-burfi',                 name: 'Peanut Burfi',                    icon: '🍬', category: 'Sweets' },
  { id: 'till-burfi',                   name: 'Till Burfi',                      icon: '🍬', category: 'Sweets' },
  { id: 'spl-dates-burfi',              name: 'Spl Dates Burfi',                 icon: '🍬', category: 'Sweets' },
  { id: 'american-dryfruit-burfi',      name: 'American Dryfruit Burfi',         icon: '🍬', category: 'Sweets' },
  { id: 'red-kavani-burfi',             name: 'Red Kavani Burfi',                icon: '🍬', category: 'Sweets' },
  { id: 'solamavu-burfi',               name: 'Solamavu Burfi',                  icon: '🍬', category: 'Sweets' },
  { id: 'soan-papdi',                   name: 'Soan Papdi',                      icon: '🍬', category: 'Sweets' },
  { id: 'spl-soan-papdi',               name: 'Spl Soan Papdi',                  icon: '🍬', category: 'Sweets' },
  { id: 'spl-mothi-laadu',              name: 'Spl Mothi Laadu',                 icon: '🍬', category: 'Sweets' },
  { id: 'thirupathi-laadu',             name: 'Thirupathi Laadu',                icon: '🍬', category: 'Sweets' },
  { id: 'spl-dates-laadu',              name: 'Spl Dates Laadu',                 icon: '🍬', category: 'Sweets' },
  { id: 'boondhi-laadu',                name: 'Boondhi Laadu',                   icon: '🍬', category: 'Sweets' },
  { id: 'rava-laadu',                   name: 'Rava Laadu',                      icon: '🍬', category: 'Sweets' },
  { id: 'sathur-laadu',                 name: 'Sathur Laadu',                    icon: '🍬', category: 'Sweets' },
  { id: 'kaju-pista-laadu',             name: 'Kaju Pista Laadu',                icon: '🍬', category: 'Sweets' },
  { id: 'mixed-millet-laadu',           name: 'Mixed Millet Laadu',              icon: '🍬', category: 'Sweets' },
  { id: 'puffed-rice-balls',            name: 'Puffed Rice Balls',               icon: '🍬', category: 'Sweets' },
  { id: 'bombay-halwa',                 name: 'Bombay Halwa',                    icon: '🍬', category: 'Sweets' },
  { id: 'jaggery-wheat-halwa',          name: 'Jaggery Wheat Halwa',             icon: '🍬', category: 'Sweets' },
  { id: 'dryfruit-halwa',               name: 'Dryfruit Halwa',                  icon: '🍬', category: 'Sweets' },
  { id: 'milk-halwa',                   name: 'Milk Halwa',                      icon: '🍬', category: 'Sweets' },
  { id: 'carrot-halwa',                 name: 'Carrot Halwa',                    icon: '🍬', category: 'Sweets' },
  { id: 'black-grapes-halwa',           name: 'Black Grapes Halwa',              icon: '🍬', category: 'Sweets' },
  { id: 'vanilla-bites',                name: 'Vanilla Bites',                   icon: '🍬', category: 'Sweets' },
  { id: 'chocolate-bites',              name: 'Chocolate Bites',                 icon: '🍬', category: 'Sweets' },
  { id: 'kaju-pista-biscuit',           name: 'Kaju Pista Biscuit',              icon: '🍬', category: 'Sweets' },
  { id: 'kaju-chikki',                  name: 'Kaju Chikki',                     icon: '🍬', category: 'Sweets' },
  { id: 'dryfruit-chikkies',            name: 'Dryfruit Chikkies',               icon: '🍬', category: 'Sweets' },
  { id: 'kajur-kai',                    name: 'Kajur Kai',                       icon: '🍬', category: 'Sweets' },
  { id: 'spl-mothi-pak',                name: 'Spl Mothi Pak',                   icon: '🍬', category: 'Sweets' },
  { id: 'sweet-boondhi',                name: 'Sweet Boondhi',                   icon: '🍬', category: 'Sweets' },
  { id: 'boondhi',                      name: 'Boondhi',                         icon: '🍬', category: 'Sweets' },
  { id: 'oppat',                        name: 'Oppat',                           icon: '🍬', category: 'Sweets' },
  { id: 'dal-oppat',                    name: 'Dal Oppat',                       icon: '🍬', category: 'Sweets' },
  { id: 'jelabi',                       name: 'Jelabi',                          icon: '🍬', category: 'Sweets' },
  { id: 'spl-beetroot-jelabi',          name: 'Spl Beetroot Jelabi',             icon: '🍬', category: 'Sweets' },
  { id: 'jangiri',                      name: 'Jangiri',                         icon: '🍬', category: 'Sweets' },
  { id: 'mini-badusha',                 name: 'Mini Badusha',                    icon: '🍬', category: 'Sweets' },
  { id: 'chandrakala',                  name: 'Chandrakala',                     icon: '🍬', category: 'Sweets' },
  { id: 'jamoon',                       name: 'Jamoon',                          icon: '🍬', category: 'Sweets' },
  { id: 'peda',                         name: 'Peda',                            icon: '🍬', category: 'Sweets' },
  { id: 'agrapan',                      name: 'Agrapan',                         icon: '🍬', category: 'Sweets' },
  { id: 'damrot',                       name: 'Damrot',                          icon: '🍬', category: 'Sweets' },

  // ── SAVOURIES ─────────────────────────────────────────────────────────────
  { id: 'masala-cashew',                name: 'Masala Cashew',                   icon: '🥜', category: 'Savouries' },
  { id: 'pepper-cashew',                name: 'Pepper Cashew',                   icon: '🥜', category: 'Savouries' },
  { id: 'moong-dal-karam',              name: 'Moong Dal Karam',                 icon: '🥜', category: 'Savouries' },
  { id: 'moong-dal-salt',               name: 'Moong Dal Salt',                  icon: '🥜', category: 'Savouries' },
  { id: 'regular-nippat',               name: 'Regular Nippat',                  icon: '🥜', category: 'Savouries' },
  { id: 'garlic-nippat',                name: 'Garlic Nippat',                   icon: '🥜', category: 'Savouries' },
  { id: 'ragi-nippat',                  name: 'Ragi Nippat',                     icon: '🥜', category: 'Savouries' },
  { id: 'pepper-nippat',                name: 'Pepper Nippat',                   icon: '🥜', category: 'Savouries' },
  { id: 'pakoda',                       name: 'Pakoda',                          icon: '🥜', category: 'Savouries' },
  { id: 'pearl-pakoda',                 name: 'Pearl Pakoda',                    icon: '🥜', category: 'Savouries' },
  { id: 'bitter-gourd-pakoda',          name: 'Bitter Gourd Pakoda',             icon: '🥜', category: 'Savouries' },
  { id: 'cashew-pakoda',                name: 'Cashew Pakoda',                   icon: '🥜', category: 'Savouries' },
  { id: 'finger-chips',                 name: 'Finger Chips',                    icon: '🥜', category: 'Savouries' },
  { id: 'potato-chips',                 name: 'Potato Chips',                    icon: '🥜', category: 'Savouries' },
  { id: 'banana-chips',                 name: 'Banana Chips',                    icon: '🥜', category: 'Savouries' },
  { id: 'wheel-chips',                  name: 'Wheel Chips',                     icon: '🥜', category: 'Savouries' },
  { id: 'corn-chips',                   name: 'Corn Chips',                      icon: '🥜', category: 'Savouries' },
  { id: 'tapicco-chips',                name: 'Tapicco Chips',                   icon: '🥜', category: 'Savouries' },
  { id: 'kachori',                      name: 'Kachori',                         icon: '🥜', category: 'Savouries' },
  { id: 'congress',                     name: 'Congress',                        icon: '🥜', category: 'Savouries' },
  { id: 'masala-groundnut',             name: 'Masala Groundnut',                icon: '🥜', category: 'Savouries' },
  { id: 'masala-pori',                  name: 'Masala Pori',                     icon: '🥜', category: 'Savouries' },
  { id: 'avalakki',                     name: 'Avalakki',                        icon: '🥜', category: 'Savouries' },
  { id: 'avarakka',                     name: 'Avarakka',                        icon: '🥜', category: 'Savouries' },
  { id: 'regular-mixture',              name: 'Regular Mixture',                 icon: '🥜', category: 'Savouries' },
  { id: 'mangalore-mixture',            name: 'Mangalore Mixture',               icon: '🥜', category: 'Savouries' },
  { id: 'bombay-mixture',               name: 'Bombay Mixture',                  icon: '🥜', category: 'Savouries' },
  { id: 'snb-special-mixture',          name: 'SNB Special Mixture',             icon: '🥜', category: 'Savouries' },
  { id: 'ragi-mixture',                 name: 'Ragi Mixture',                    icon: '🥜', category: 'Savouries' },
  { id: 'pudina-mixture',               name: 'Pudina Mixture',                  icon: '🥜', category: 'Savouries' },
  { id: 'thinai-millet-mixture',        name: 'Thinai Millet Mixture',           icon: '🥜', category: 'Savouries' },
  { id: 'kara-boondhi',                 name: 'Kara Boondhi',                    icon: '🥜', category: 'Savouries' },
  { id: 'chana-dal',                    name: 'Chana Dal',                       icon: '🥜', category: 'Savouries' },
  { id: 'mix-dal',                      name: 'Mix Dal',                         icon: '🥜', category: 'Savouries' },
  { id: 'rings',                        name: 'Rings',                           icon: '🥜', category: 'Savouries' },
  { id: 'om-pudi',                      name: 'Om Pudi',                         icon: '🥜', category: 'Savouries' },
  { id: 'mota-sev',                     name: 'Mota Sev',                        icon: '🥜', category: 'Savouries' },
  { id: 'sweet-biscuit',                name: 'Sweet Biscuit',                   icon: '🥜', category: 'Savouries' },
  { id: 'madur-vada',                   name: 'Madur Vada',                      icon: '🥜', category: 'Savouries' },
  { id: 'samosa',                       name: 'Samosa',                          icon: '🥜', category: 'Savouries' },
  { id: 'athirasam',                    name: 'Athirasam',                       icon: '🥜', category: 'Savouries' },
  { id: 'till-muruk',                   name: 'Till Muruk',                      icon: '🥜', category: 'Savouries' },
  { id: 'curry-muruk',                  name: 'Curry Muruk',                     icon: '🥜', category: 'Savouries' },
  { id: 'ribbon-muruk',                 name: 'Ribbon Muruk',                    icon: '🥜', category: 'Savouries' },
  { id: '8-suli-muruk',                 name: '8 Suli Muruk (Spl Muruk)',        icon: '🥜', category: 'Savouries' },
  { id: 'kai-suthal-muruk',             name: 'Kai Suthal Muruk',                icon: '🥜', category: 'Savouries' },
  { id: 'thenkuzhal-salt-muruk',        name: 'Thenkuzhal Salt Muruk',           icon: '🥜', category: 'Savouries' },
  { id: 'thenkuzhal-masala-muruk',      name: 'Thenkuzhal Masala Muruk',         icon: '🥜', category: 'Savouries' },
  { id: 'mullu-muruk',                  name: 'Mullu Muruk',                     icon: '🥜', category: 'Savouries' },
  { id: 'jangiri-muruk',                name: 'Jangiri Muruk',                   icon: '🥜', category: 'Savouries' },
  { id: 'beetroot-muruk',               name: 'Beetroot Muruk',                  icon: '🥜', category: 'Savouries' },
  { id: 'onion-muruk',                  name: 'Onion Muruk',                     icon: '🥜', category: 'Savouries' },
  { id: 'achu-muruk',                   name: 'Achu Muruk',                      icon: '🥜', category: 'Savouries' },
  { id: 'garlic-muruk',                 name: 'Garlic Muruk',                    icon: '🥜', category: 'Savouries' },
  { id: 'benne-muruk',                  name: 'Benne Muruk',                     icon: '🥜', category: 'Savouries' },
  { id: 'chettinadu-muruk',             name: 'Chettinadu Muruk',                icon: '🥜', category: 'Savouries' },
  { id: 'kambu-muruk',                  name: 'Kambu Muruk',                     icon: '🥜', category: 'Savouries' },
  { id: 'samai-muruk',                  name: 'Samai Muruk',                     icon: '🥜', category: 'Savouries' },
  { id: 'ragi-muruk',                   name: 'Ragi Muruk',                      icon: '🥜', category: 'Savouries' },
  { id: 'kambu-millet-muruk',           name: 'Kambu Millet Muruk',              icon: '🥜', category: 'Savouries' },
  { id: 'black-kavani-millet-muruk',    name: 'Black Kavani Millet Muruk',       icon: '🥜', category: 'Savouries' },
  { id: 'red-kavani-millet-garlic-muruk', name: 'Red Kavani Millet Garlic Muruk', icon: '🥜', category: 'Savouries' },
  { id: 'beetroot-samai-millet-muruk',  name: 'Beetroot Samai Millet Muruk',     icon: '🥜', category: 'Savouries' },
  { id: 'varagu-millet-onion-muruk',    name: 'Varagu Millet Onion Muruk',       icon: '🥜', category: 'Savouries' },
  { id: 'ragi-garlic-muruk',            name: 'Ragi Garlic Muruk',               icon: '🥜', category: 'Savouries' },
  { id: 'kambu-onion-muruk',            name: 'Kambu Pearl Millet Onion Muruk',  icon: '🥜', category: 'Savouries' },
  { id: 'samai-onion-muruk',            name: 'Samai Little Millet Onion Muruk', icon: '🥜', category: 'Savouries' },
  { id: 'ragi-onion-muruk',             name: 'Ragi Onion Muruk',                icon: '🥜', category: 'Savouries' },
  { id: 'samai-onion-rings',            name: 'Samai Millet Onion Rings',        icon: '🥜', category: 'Savouries' },
  { id: 'ragi-onion-rings',             name: 'Ragi Onion Rings',                icon: '🥜', category: 'Savouries' },

  // ── BAKERY ─────────────────────────────────────────────────────────────────
  { id: 'bread',                        name: 'Bread',                           icon: '🍞', category: 'Bakery' },
  { id: 'bun',                          name: 'Bun',                             icon: '🫓', category: 'Bakery' },
  { id: 'spl-bun',                      name: 'Spl Bun',                         icon: '🫓', category: 'Bakery' },
  { id: 'masala-bun',                   name: 'Masala Bun',                      icon: '🫓', category: 'Bakery' },
  { id: 'coconut-bun',                  name: 'Coconut Bun',                     icon: '🫓', category: 'Bakery' },
  { id: 'puff-base',                    name: 'Puff Base',                       icon: '🍞', category: 'Bakery' },
  { id: 'rusk',                         name: 'Rusk',                            icon: '🍞', category: 'Bakery' },
  { id: 'spl-rusk-bakery',              name: 'Spl Rusk',                        icon: '🍞', category: 'Bakery' },
  { id: 'butter-rusk',                  name: 'Butter Rusk',                     icon: '🍞', category: 'Bakery' },
  { id: 'wheat-bread',                  name: 'Wheat Bread',                     icon: '🍞', category: 'Bakery' },
  { id: 'pav-bread',                    name: 'Pav Bread',                       icon: '🍞', category: 'Bakery' },
  { id: 'vanilla-sponge',               name: 'Vanilla Sponge',                  icon: '🎂', category: 'Bakery' },
  { id: 'eggless-vanilla-sponge',       name: 'Eggless Vanilla Sponge',          icon: '🎂', category: 'Bakery' },
  { id: 'chocolate-sponge',             name: 'Chocolate Sponge',                icon: '🎂', category: 'Bakery' },
  { id: 'eggless-chocolate-sponge',     name: 'Eggless Chocolate Sponge',        icon: '🎂', category: 'Bakery' },
  { id: 'red-velvet-sponge',            name: 'Red Velvet Sponge',               icon: '🎂', category: 'Bakery' },
  { id: 'plain-cake',                   name: 'Plain Cake',                      icon: '🎂', category: 'Bakery' },
  { id: 'banana-cake',                  name: 'Banana Cake',                     icon: '🎂', category: 'Bakery' },
  { id: 'carrot-cake',                  name: 'Carrot Cake',                     icon: '🎂', category: 'Bakery' },
  { id: 'fruit-cake',                   name: 'Fruit Cake',                      icon: '🎂', category: 'Bakery' },
  { id: 'plum-cake',                    name: 'Plum Cake',                       icon: '🎂', category: 'Bakery' },
  { id: 'black-forest',                 name: 'Black Forest',                    icon: '🎂', category: 'Bakery' },
  { id: 'brownie',                      name: 'Brownie',                         icon: '🎂', category: 'Bakery' },
  { id: 'pudding-cake',                 name: 'Pudding Cake',                    icon: '🎂', category: 'Bakery' },
  { id: 'muffins',                      name: 'Muffins',                         icon: '🧁', category: 'Bakery' },
  { id: 'croissant',                    name: 'Croissant',                       icon: '🥐', category: 'Bakery' },
  { id: 'naan',                         name: 'Naan',                            icon: '🫓', category: 'Bakery' },
  { id: 'veg-roll',                     name: 'Veg Roll',                        icon: '🌯', category: 'Bakery' },
  { id: 'egg-roll',                     name: 'Egg Roll',                        icon: '🌯', category: 'Bakery' },
  { id: 'cutlet',                       name: 'Cutlet',                          icon: '🍽️', category: 'Bakery' },
  { id: 'french-macaroons',             name: 'French Macaroons',                icon: '🍪', category: 'Bakery' },
  { id: 'baked-nippat',                 name: 'Baked Nippat',                    icon: '🍪', category: 'Bakery' },
  { id: 'bakalava',                     name: 'Bakalava',                        icon: '🍮', category: 'Bakery' },

  // ── COOKIES ────────────────────────────────────────────────────────────────
  { id: 'salt-biscuit',                 name: 'Salt Biscuit',                    icon: '🍪', category: 'Cookies' },
  { id: 'kara-biscuit',                 name: 'Kara Biscuit',                    icon: '🍪', category: 'Cookies' },
  { id: 'coconut-biscuit',              name: 'Coconut Biscuit',                 icon: '🍪', category: 'Cookies' },
  { id: 'groundnut-biscuit',            name: 'Groundnut Biscuit',               icon: '🍪', category: 'Cookies' },
  { id: 'butter-biscuit',               name: 'Butter Biscuit',                  icon: '🍪', category: 'Cookies' },
  { id: 'choco-chips-cookies',          name: 'Choco Chips Cookies',             icon: '🍪', category: 'Cookies' },
  { id: 'honey-badam-biscuit',          name: 'Honey Badam Biscuit',             icon: '🍪', category: 'Cookies' },
  { id: 'millet-biscuit',               name: 'Millet Biscuit',                  icon: '🍪', category: 'Cookies' },
  { id: 'coconut-crunch',               name: 'Coconut Crunch',                  icon: '🍪', category: 'Cookies' },
  { id: 'vanilla-crunch',               name: 'Vanilla Crunch',                  icon: '🍪', category: 'Cookies' },
  { id: 'badam-sticks',                 name: 'Badam Sticks',                    icon: '🍪', category: 'Cookies' },
  { id: 'oats-biscuit',                 name: 'Oats Biscuit',                    icon: '🍪', category: 'Cookies' },
  { id: 'spl-om-sticks',                name: 'Spl Om Sticks',                   icon: '🍪', category: 'Cookies' },
  { id: 'om-sticks',                    name: 'Om Sticks',                       icon: '🍪', category: 'Cookies' },
  { id: 'wheat-biscuit',                name: 'Wheat Biscuit',                   icon: '🍪', category: 'Cookies' },
  { id: 'ragi-biscuit',                 name: 'Ragi Biscuit',                    icon: '🍪', category: 'Cookies' },
  { id: 'bormida-biscuit',              name: 'Bormida Biscuit',                 icon: '🍪', category: 'Cookies' },
  { id: 'zebra-biscuit',                name: 'Zebra Biscuit',                   icon: '🍪', category: 'Cookies' },
  { id: 'ooty-varki',                   name: 'Ooty Varki',                      icon: '🍪', category: 'Cookies' },
  { id: 'milk-biscuit',                 name: 'Milk Biscuit',                    icon: '🍪', category: 'Cookies' },
  { id: 'cashew-biscuit',               name: 'Cashew Biscuit',                  icon: '🍪', category: 'Cookies' },
  { id: 'pcod-pcos',                    name: 'PCOD & PCOS',                     icon: '🍪', category: 'Cookies' },
  { id: 'heart-cookie',                 name: 'Heart',                           icon: '🍪', category: 'Cookies' },
  { id: 'bone-cookie',                  name: 'Bone',                            icon: '🍪', category: 'Cookies' },
  { id: 'brain-cookie',                 name: 'Brain',                           icon: '🍪', category: 'Cookies' },
  { id: 'gut-cookie',                   name: 'Gut',                             icon: '🍪', category: 'Cookies' },
];

export const BRANCHES: Branch[] = ['VRSNB', 'SNB', 'Hosur'];

// Materials per unit of each item (kept for backward compatibility)
export const RECIPE_MAP: Record<string, MaterialRequirement[]> = {
  'bread': [
    { material: 'Maida', quantity: 1000, unit: 'g' },
    { material: 'Sugar', quantity: 320, unit: 'g' },
    { material: 'Salt', quantity: 10, unit: 'g' },
    { material: 'Yeast', quantity: 9.3, unit: 'g' },
    { material: 'Milk Powder', quantity: 13.3, unit: 'g' },
    { material: 'Water', quantity: 467, unit: 'ml' },
    { material: 'Oil', quantity: 133, unit: 'ml' },
  ],
  'bun': [
    { material: 'Maida', quantity: 1000, unit: 'g' },
    { material: 'Sugar', quantity: 300, unit: 'g' },
    { material: 'Salt', quantity: 10, unit: 'g' },
    { material: 'Yeast', quantity: 13.3, unit: 'g' },
    { material: 'Water', quantity: 467, unit: 'ml' },
    { material: 'Oil', quantity: 160, unit: 'ml' },
  ],
  'rusk': [
    { material: 'Maida', quantity: 1000, unit: 'g' },
    { material: 'Sugar', quantity: 300, unit: 'g' },
    { material: 'Salt', quantity: 10, unit: 'g' },
    { material: 'Yeast', quantity: 10, unit: 'g' },
    { material: 'Milk Powder', quantity: 40, unit: 'g' },
    { material: 'Custard Powder', quantity: 40, unit: 'g' },
    { material: 'Butter', quantity: 33, unit: 'g' },
    { material: 'Water', quantity: 500, unit: 'ml' },
  ],
  'plain-cake': [
    { material: 'Maida', quantity: 1000, unit: 'g' },
    { material: 'Sugar', quantity: 1000, unit: 'g' },
    { material: 'Egg', quantity: 30, unit: 'nos' },
    { material: 'Cake Gel', quantity: 50, unit: 'g' },
    { material: 'Oil', quantity: 500, unit: 'ml' },
    { material: 'Milk Powder', quantity: 50, unit: 'g' },
  ],
  'croissant': [
    { material: 'Maida', quantity: 1575, unit: 'g' },
    { material: 'Sugar', quantity: 140, unit: 'g' },
    { material: 'Salt', quantity: 35, unit: 'g' },
    { material: 'Yeast', quantity: 10, unit: 'g' },
    { material: 'Butter', quantity: 235, unit: 'g' },
    { material: 'Egg', quantity: 200, unit: 'g' },
  ],
};
