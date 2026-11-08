// Item catalog. The same list is loaded into the contract at deploy time,
// so dealer prices on chain use exactly these base values.

export type Category = 'tech' | 'style' | 'jewelry' | 'music' | 'collectibles' | 'oddities';
// X-ray material decides the silhouette color on the scanner.
export type Material = 'organic' | 'plastic' | 'metal' | 'dense';

export interface ItemDef {
  id: string;
  name: string;
  level: number; // value ladder step, 0..6
  category: Category;
  material: Material;
}

// Miles per ladder step. Each step is about 3.2x the one before.
export const LADDER = [10, 33, 110, 350, 1100, 3500, 11000];

export const ITEMS: ItemDef[] = [
  // L0 · 10
  { id: 'rubber-duck', name: 'Rubber Duck', level: 0, category: 'oddities', material: 'plastic' },
  { id: 'paperback', name: 'Dog-eared Paperback', level: 0, category: 'collectibles', material: 'organic' },
  { id: 'flip-flops', name: 'Flip-Flops', level: 0, category: 'style', material: 'plastic' },
  { id: 'neck-pillow', name: 'Neck Pillow', level: 0, category: 'oddities', material: 'organic' },
  { id: 'snow-globe', name: 'Snow Globe', level: 0, category: 'collectibles', material: 'plastic' },
  // L1 · 33
  { id: 'headphones', name: 'Studio Headphones', level: 1, category: 'tech', material: 'plastic' },
  { id: 'aviators', name: 'Aviator Sunglasses', level: 1, category: 'style', material: 'metal' },
  { id: 'harmonica', name: 'Blues Harmonica', level: 1, category: 'music', material: 'metal' },
  { id: 'teddy-bear', name: 'Old Teddy Bear', level: 1, category: 'collectibles', material: 'organic' },
  { id: 'hot-sauce', name: 'Ghost Pepper Sauce', level: 1, category: 'oddities', material: 'organic' },
  // L2 · 110
  { id: 'film-camera', name: 'Film Camera', level: 2, category: 'tech', material: 'metal' },
  { id: 'sneakers', name: 'Limited Sneakers', level: 2, category: 'style', material: 'organic' },
  { id: 'vinyl', name: 'Signed Vinyl', level: 2, category: 'music', material: 'plastic' },
  { id: 'comic', name: 'First-Issue Comic', level: 2, category: 'collectibles', material: 'organic' },
  { id: 'brass-compass', name: 'Brass Compass', level: 2, category: 'oddities', material: 'metal' },
  // L3 · 350
  { id: 'handheld', name: 'Handheld Console', level: 3, category: 'tech', material: 'plastic' },
  { id: 'silk-scarf', name: 'Couture Silk Scarf', level: 3, category: 'style', material: 'organic' },
  { id: 'pearls', name: 'Pearl Earrings', level: 3, category: 'jewelry', material: 'dense' },
  { id: 'ukulele', name: 'Koa Ukulele', level: 3, category: 'music', material: 'organic' },
  { id: 'pocket-watch', name: 'Pocket Watch', level: 3, category: 'collectibles', material: 'metal' },
  // L4 · 1,100
  { id: 'laptop', name: 'Ultralight Laptop', level: 4, category: 'tech', material: 'metal' },
  { id: 'leather-bag', name: 'Vintage Leather Bag', level: 4, category: 'style', material: 'organic' },
  { id: 'gold-chain', name: 'Gold Chain', level: 4, category: 'jewelry', material: 'dense' },
  { id: 'violin', name: 'Old Violin', level: 4, category: 'music', material: 'organic' },
  { id: 'meteorite', name: 'Meteorite Fragment', level: 4, category: 'oddities', material: 'dense' },
  // L5 · 3,500
  { id: 'cinema-camera', name: 'Cinema Camera', level: 5, category: 'tech', material: 'metal' },
  { id: 'couture-jacket', name: 'Runway Jacket', level: 5, category: 'style', material: 'organic' },
  { id: 'diamond-ring', name: 'Diamond Ring', level: 5, category: 'jewelry', material: 'dense' },
  { id: 'electric-guitar', name: 'Vintage Electric Guitar', level: 5, category: 'music', material: 'metal' },
  { id: 'stamp-album', name: 'Rare Stamp Album', level: 5, category: 'collectibles', material: 'organic' },
  // L6 · 11,000
  { id: 'prototype-phone', name: 'Unreleased Prototype Phone', level: 6, category: 'tech', material: 'plastic' },
  { id: 'chronograph', name: 'Swiss Chronograph', level: 6, category: 'jewelry', material: 'metal' },
  { id: 'gold-bar', name: 'Gold Bar', level: 6, category: 'oddities', material: 'dense' },
  { id: 'golden-mask', name: 'Golden Mask', level: 6, category: 'collectibles', material: 'dense' },
  { id: 'lost-reel', name: 'Lost Film Reel', level: 6, category: 'music', material: 'organic' },
];

export const ITEM_BY_ID: Record<string, ItemDef> = Object.fromEntries(ITEMS.map((i) => [i.id, i]));

export function baseValue(id: string): number {
  return LADDER[ITEM_BY_ID[id].level];
}

export function itemsAtLevel(level: number): ItemDef[] {
  return ITEMS.filter((i) => i.level === level);
}
