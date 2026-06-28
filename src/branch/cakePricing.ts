export type CakeCreamType = 'Butter Cream' | 'Fresh Cream';
export type CakeDesignType = 'Normal' | 'Custom 20%' | 'Custom 25%';

export type CakeTypePrice = {
  id: string;
  creamType: CakeCreamType;
  name: string;
  perKg: number;
  halfKg?: number;
  flavours: string[];
};

export const CAKE_TYPE_PRICES: CakeTypePrice[] = [
  {
    id: 'butter-birthday',
    creamType: 'Butter Cream',
    name: 'Birthday Flavours',
    perKg: 450,
    halfKg: 275,
    flavours: ['Vanilla', 'Strawberry', 'Pineapple', 'Black Currant'],
  },
  {
    id: 'butter-premium',
    creamType: 'Butter Cream',
    name: 'Birthday Premium Flavours',
    perKg: 500,
    halfKg: 300,
    flavours: ['Blueberry', 'Butterscotch', 'Honey', 'Chocolate'],
  },
  {
    id: 'butter-fondant',
    creamType: 'Butter Cream',
    name: 'Fondant Cakes',
    perKg: 1000,
    flavours: [],
  },
  {
    id: 'fresh-pastry',
    creamType: 'Fresh Cream',
    name: 'Birthday Pastry Cakes',
    perKg: 800,
    halfKg: 450,
    flavours: ['Black Forest', 'White Forest', 'Strawberry Delight', 'Pineapple Delight'],
  },
  {
    id: 'fresh-flavour-pastry',
    creamType: 'Fresh Cream',
    name: 'Birthday Flavour Pastry Cakes',
    perKg: 900,
    halfKg: 500,
    flavours: ['Butterscotch', 'Blueberry', 'Choco Chips', 'Choco Truffle'],
  },
  {
    id: 'fresh-prime',
    creamType: 'Fresh Cream',
    name: 'Birthday Prime Flavour Cakes',
    perKg: 1000,
    halfKg: 550,
    flavours: ['Nutty Bubbly', 'Double Chocolate', 'Dry Fruits Punch', 'Red Velvet'],
  },
  {
    id: 'fresh-fondant',
    creamType: 'Fresh Cream',
    name: 'Fondant Cakes',
    perKg: 1400,
    flavours: [],
  },
];

export const CAKE_DESIGNS: CakeDesignType[] = ['Normal', 'Custom 20%', 'Custom 25%'];
export const CAKE_DRAWING_CHARGE = 150;
export const CAKE_PHOTO_CHARGE = 100;

export function cakeTypesFor(creamType: CakeCreamType | '') {
  return CAKE_TYPE_PRICES.filter((cake) => cake.creamType === creamType);
}

export function findCakeType(cakeTypeId: string) {
  return CAKE_TYPE_PRICES.find((cake) => cake.id === cakeTypeId);
}

export function calculateCakePrice(input: {
  cakeTypeId: string;
  weightKg: number;
  design: CakeDesignType;
  drawingWork?: boolean;
  photoWork?: boolean;
}) {
  const cakeType = findCakeType(input.cakeTypeId);
  const weightKg = Number(input.weightKg || 0);
  const baseAmount = cakeType
    ? Math.abs(weightKg - 0.5) < 0.0001 && cakeType.halfKg != null
      ? cakeType.halfKg
      : cakeType.perKg * weightKg
    : 0;
  const designPercent = input.design === 'Custom 20%' ? 20 : input.design === 'Custom 25%' ? 25 : 0;
  const designCharge = baseAmount * (designPercent / 100);
  const drawingCharge = input.drawingWork ? CAKE_DRAWING_CHARGE : 0;
  const photoCharge = input.photoWork ? CAKE_PHOTO_CHARGE : 0;
  const total = Math.round((baseAmount + designCharge + drawingCharge + photoCharge + Number.EPSILON) * 100) / 100;
  return {
    cakeType,
    baseRate: cakeType?.perKg ?? 0,
    halfKgRate: cakeType?.halfKg,
    baseAmount,
    designPercent,
    designCharge,
    drawingCharge,
    photoCharge,
    total,
  };
}
