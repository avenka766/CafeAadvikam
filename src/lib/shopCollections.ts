type ShopItem = { name: string; category: string };

export const shopCollections = [
  { id: 'burfi', title: 'Burfi', subtitle: 'Seeds take centre stage.', description: 'Our Dry Seeds Burfi and Till Burfi are generously filled with carefully selected seeds, so every bite celebrates their texture and flavour, rather than just sweetness. Discover varieties made with natural jaggery, palm jaggery or monk fruit extract.', pattern: /BURF[IY]|BARFI/i, note: 'Dry Seeds Burfi · Till Burfi', family: 'Sweet traditions' },
  { id: 'baklawa', title: 'Baklawa', subtitle: 'Real dry fruits. Beautiful layers.', description: 'Delicate layers meet a generous filling of real dry fruits. We build the flavour with the ingredients themselves, never dry-fruit extracts, for a rich, satisfying bite.', pattern: /BAKLA[WV]A/i, family: 'Sweet traditions' },
  { id: 'cashew', title: 'Cashew creations', subtitle: 'Goodness begins with the whole nut.', description: 'Cashew biscuits, laddus and sweets, made with premium whole cashews. We choose the finest grade, rather than two-piece broken cashews, to bring that unmistakable richness to every creation.', pattern: /CASHEW|KAJU/i, family: 'Sweet traditions' },
  { id: 'chips', title: 'Chips', subtitle: 'A beautifully simple crunch.', description: 'Our banana chips are made with pure cold-pressed oil, letting the banana’s own flavour shine. Carefully sliced and prepared for the crisp bite that makes one handful turn into another.', pattern: /CHIPS/i, family: 'Savoury favourites' },
  { id: 'chocolate', title: 'Chocolate', subtitle: 'Small creations. Heartfelt indulgence.', description: 'Our special handcrafted chocolates are made with love and a careful eye for every finish. A little moment of indulgence to savour yourself or share with someone special.', pattern: /CHOCOLATE/i, family: 'Sweet traditions' },
  { id: 'cookies', title: 'Cookies', subtitle: 'A craft with its own dedicated bakers.', description: 'Our talented cookie bakers specialise in cookies alone. From mixing and shaping to that final bake, their attention brings you beautifully balanced flavour and a satisfying bite.', pattern: /COOKIE/i, family: 'From the oven' },
  { id: 'dal', title: 'Dal', subtitle: 'Our spices. Our signature.', description: 'We prepare our own spice blends for our dal favourites. Thoughtfully balanced seasoning brings warmth, crunch and character to every handful, with flavour that feels unmistakably ours.', pattern: /^DAL$/i, family: 'Savoury favourites' },
  { id: 'halwa', title: 'Halwa', subtitle: 'Richness you can savour slowly.', description: 'Made with pure Nandini ghee, our halwa celebrates patient preparation and a wonderfully rich finish. Each spoonful carries the comfort of a much-loved traditional sweet.', pattern: /HALWA/i, family: 'Sweet traditions' },
  { id: 'jamun', title: 'Jamun', subtitle: 'Soft hearts. Sweet memories.', description: 'Tender, indulgent and made for those “just one more” moments. Our jamuns deliver the taste you love, without added preservatives or colours.', pattern: /JAMUN/i, family: 'Sweet traditions' },
  { id: 'laddu', title: 'Laddu', subtitle: 'Expert hands. Timeless flavour.', description: 'Our dedicated laddu masters bring exceptional workmanship to every batch. Careful roasting, balanced flavour and patient shaping turn familiar ingredients into something worth celebrating.', pattern: /LAD[DUO]+/i, family: 'Sweet traditions' },
  { id: 'mixture', title: 'Mixture', subtitle: 'Every handful has a little more to discover.', description: 'Our own spice blends bring together layers of crunch and flavour. Carefully combined textures and balanced seasoning make these mixtures a natural companion to good conversation and evening tea.', pattern: /MIXTURE|^MIX$/i, family: 'Savoury favourites' },
  { id: 'muruk', title: 'Muruk', subtitle: 'Tradition with a signature crunch.', description: 'Made with our own spice blends and careful attention to texture. Each crisp twist brings the warmth of a familiar recipe and the pleasure of a well-made savoury.', pattern: /MURUK|MURUKKU/i, family: 'Savoury favourites' },
  { id: 'mysore-pak', title: 'Mysore Pak', subtitle: 'The real taste of a classic.', description: 'Discover the authentic flavour of Mysore Pak made with pure Nandini ghee. Rich aroma and a beautifully indulgent bite pay tribute to this timeless favourite.', pattern: /MYSORE\s*PA[CK]/i, family: 'Sweet traditions' },
  { id: 'nippat', title: 'Nippat', subtitle: 'Bold flavour. A crisp little ritual.', description: 'Our house-made spice blends give each nippat its distinctive character. Carefully prepared for an enjoyable crunch, it is a savoury worth making time for.', pattern: /NIPPAT|NIPPATTU/i, family: 'Savoury favourites' },
  { id: 'oil', title: 'Cold-pressed oils', subtitle: 'Good ingredients belong in your kitchen, too.', description: 'Bring home our selection of cold-pressed oils for your everyday cooking. Discover their natural character and choose the oil that suits the flavours you love to make.', pattern: /\bOILS?\b/i, family: 'The pantry' },
  { id: 'pickles-powders', title: 'Pickles & powders', subtitle: 'Homestyle skill, in every spoonful.', description: 'Our specialised women’s team prepares pickles with quality oil and our own masalas. The same care goes into our spice powders, including idli podi, bringing a thoughtful finishing touch to everyday meals.', pattern: /PICKLE|POWDER|PODI/i, family: 'The pantry' },
  { id: 'peda', title: 'Peda', subtitle: 'Simple pleasures, carefully perfected.', description: 'A traditional favourite shaped with care, with a satisfying richness and a delicate finish. Our pedas are made for celebrations, thoughtful gifts and the joy of sharing something sweet.', pattern: /PEDA|PEDHA/i, family: 'Sweet traditions' },
  { id: 'oppat', title: 'Our famous Oppat', subtitle: 'A little Karnataka in every bite.', description: 'We select first-quality coconuts from chosen parts of Karnataka for the aroma that makes our Oppat so loved. That fragrant first bite is an invitation to slow down and savour something special. Delivered only within 30 km of Hosur.', pattern: /OPPAT|OBBATTU|HOLIGE|POLI/i, local: true, family: 'Sweet traditions' },
  { id: 'bakery', title: 'Bakery & Dilpasand', subtitle: 'Freshly baked. Locally loved.', description: 'Our famous coconut Dilpasand, puffs, breads and rusks are made to be enjoyed fresh. Browse here, then contact our branch to order. No online orders; delivery only in and around Hosur within 30 km.', pattern: /BAKERY|DILPASAND|DIL\s*PASAND|PUFF|BREAD|RUSK/i, local: true, family: 'Order directly from our branch' },
  { id: 'cake', title: 'Cakes', subtitle: 'Your celebration, freshly made.', description: 'Explore our cakes and speak to our team about your occasion. We do not take online cake orders. Contact our branch to order; delivery is available only within 30 km of Hosur.', pattern: /CAKE/i, local: true, family: 'Order directly from our branch' },
] satisfies { id: string; title: string; subtitle: string; description: string; pattern: RegExp; family: string; note?: string; local?: boolean }[];

export function isOnlineShopItem(item: ShopItem) {
  return !/BAKERY|CAKE/i.test(item.category) && !/\b(DIL\s*PASAND|DILPASAND|PUFFS?|BREAD|RUSKS?|CAKES?|PASTR(?:Y|IES)|BUNS?|DOUGHNUTS?|DONUTS?|MUFFINS?|CROISSANTS?)\b/i.test(item.name);
}

export function matchesShopCollection(item: ShopItem, id: string) {
  const collection = shopCollections.find((entry) => entry.id === id);
  if (!collection) return false;
  if (collection.pattern.test(item.category)) return true;
  // Generic categories need the product name; a chocolate cake must stay in Cakes.
  const hasSpecificCategory = shopCollections.some((entry) => entry.pattern.test(item.category));
  return (!hasSpecificCategory || /^(SWEETS|SPL SWEETS|MIX)$/i.test(item.category.trim())) && collection.pattern.test(item.name);
}

export function isLocalDeliveryItem(item: ShopItem) {
  return !isOnlineShopItem(item) || matchesShopCollection(item, 'oppat');
}

export function shopCollectionImage(id: string) {
  if (id === 'cake') return '/cake-gallery/fresh-fruit-photo-cake.jpg';
  return '/images/collections/' + id + '.webp';
}

export function shopItemImage(item: ShopItem) {
  const collection = shopCollections.find((entry) => matchesShopCollection(item, entry.id));
  const fallback = /SWEET|MIX/i.test(item.category) ? 'burfi' : 'mixture';
  return { src: shopCollectionImage(collection?.id || fallback), alt: (collection?.title || 'SNB favourites') + ' — illustrative collection image' };
}
