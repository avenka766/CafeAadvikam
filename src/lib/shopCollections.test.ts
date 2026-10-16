import { describe, expect, it } from 'vitest';
import { isLocalDeliveryItem, isOnlineShopItem, matchesShopCollection, shopCollections, shopItemImage } from './shopCollections';

describe('online collections and delivery scope', () => {
  it('shows branch-only products for browsing but keeps them unavailable for online ordering', () => {
    const bakery = { name: 'Cashew biscuit', category: 'BAKERY' };
    expect(isOnlineShopItem(bakery)).toBe(false);
    expect(matchesShopCollection(bakery, 'bakery')).toBe(true);
    expect(isOnlineShopItem({ name: 'Butter cookie', category: 'COOKIES' })).toBe(true);
    for (const name of ['Birthday cake', 'Puffs', 'Veg puff', 'Bread', 'Sweet Rusk', 'Cream bun', 'Muffin', 'Dilpasand']) {
      expect(isOnlineShopItem({ name, category: 'SWEETS' })).toBe(false);
    }
    expect(isOnlineShopItem({ name: 'Chocolate truffle', category: 'CAKE' })).toBe(false);
  });
  it('matches catalogue spellings and generic-category products', () => {
    expect(matchesShopCollection({ name: 'Pista baklava', category: 'BAKLAVA' }, 'baklawa')).toBe(true);
    expect(matchesShopCollection({ name: 'Dry Seeds Burfi', category: 'SPL SWEETS' }, 'burfi')).toBe(true);
    expect(matchesShopCollection({ name: 'Till Burfi', category: 'SWEETS' }, 'burfi')).toBe(true);
    for (const category of ['CASHEW SWEETS', 'CASHEW BISCUIT', 'CASHEW LADDU']) {
      expect(matchesShopCollection({ name: 'Cashew favourite', category }, 'cashew')).toBe(true);
    }
    expect(matchesShopCollection({ name: 'Idli podi', category: 'PANTRY' }, 'pickles-powders')).toBe(true);
  });
  it('does not mix chocolate cakes into the chocolate collection', () => {
    const cake = { name: 'Chocolate cake', category: 'CAKE' };
    expect(matchesShopCollection(cake, 'chocolate')).toBe(false);
    expect(matchesShopCollection(cake, 'cake')).toBe(true);
    expect(matchesShopCollection({ name: 'Masala cashew', category: 'MIXTURE' }, 'cashew')).toBe(false);
  });
  it('marks Oppat local even when it is in a general sweets category', () => {
    for (const name of ['Oppat', 'Obbattu', 'Holige']) expect(isLocalDeliveryItem({ name, category: 'SWEETS' })).toBe(true);
    expect(isOnlineShopItem({ name: 'Cake roll', category: 'CAKE ROLL' })).toBe(false);
    expect(isLocalDeliveryItem({ name: 'Mysore Pak', category: 'MYSORE PAK' })).toBe(false);
  });
  it('uses matching category images in the shop', () => {
    expect(shopItemImage({name:'Till Burfi',category:'BURFI'}).src).toBe('/images/collections/burfi.webp');
    expect(shopItemImage({name:'Coconut Oppat',category:'SWEETS'}).src).toBe('/images/collections/oppat.webp');
    expect(shopCollections.some((entry) => entry.id === 'cake')).toBe(true);
    expect(shopCollections.some((entry) => entry.id === 'bakery')).toBe(true);
    expect(shopItemImage({name:'Dilpasand',category:'BAKERY'}).src).toBe('/images/collections/bakery.webp');
  });
  it('does not turn an unknown category link into all products', () => {
    expect(matchesShopCollection({ name: 'Burfi', category: 'BURFI' }, 'unknown')).toBe(false);
    expect(new Set(shopCollections.map((entry) => entry.id)).size).toBe(shopCollections.length);
  });
});
