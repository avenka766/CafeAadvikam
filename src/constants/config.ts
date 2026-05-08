import type { User } from '@/types';

export const CAFE_CONFIG = {
  name: 'Cafe Aadvikam',
  tagline: 'Restaurant & Party Hall',
  subtitle: 'Authentic Flavours, Timeless Taste',
  venture: 'A venture of VRSNB Foods LLP',
  description:
    'Experience the perfect blend of traditional flavors and modern ambiance. Our cafe serves authentic South Indian breakfast, North Indian cuisine, Chinese dishes, and freshly baked goods.',
  partyDescription:
    'Planning a celebration? Our party hall is perfect for birthdays, family gatherings, and corporate events. Ample parking available.',
  address: '109 Bagalur Main Road, Berikai 635105',
  phone: '',
  type: 'Pure Vegetarian',
  hours: '6 AM - 10 PM Daily',
  googleMapsUrl: 'https://www.google.com/maps/search/?api=1&query=Cafe+Aadvikam+109+Bagalur+Main+Road+Berikai+635105',
};

export const USERS: User[] = [
  {
    id: 'u1',
    username: 'Staff1',
    password: 'SNBcafe1',
    role: 'order_taker',
    displayName: 'Order Staff',
  },
  {
    id: 'u2',
    username: 'Staff2',
    password: 'SNBcafe2',
    role: 'billing',
    displayName: 'Billing Staff 2',
  },
  {
    id: 'u3',
    username: 'Staff3',
    password: 'SNBcafe3',
    role: 'billing',
    displayName: 'Billing Staff 3',
  },
  {
    id: 'u4',
    username: 'Staff4',
    password: 'SNBcafe4',
    role: 'billing',
    displayName: 'Billing Staff 4',
  },
  {
    id: 'u5',
    username: 'Admin',
    password: 'SNBcafe',
    role: 'admin',
    displayName: 'Administrator',
  },
  {
    id: 'u6',
    username: 'Cheff',
    password: 'SNBcafe1',
    role: 'kitchen',
    displayName: 'Kitchen Chef',
  },
];

export const TABLE_NUMBERS = Array.from({ length: 30 }, (_, i) => i + 1);

export const ORDER_STATUS_LABELS: Record<string, string> = {
  pending: 'New Order',
  preparing: 'Preparing',
  ready: 'Ready',
  served: 'Served',
  cancelled: 'Cancelled',
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 border-amber-300',
  preparing: 'bg-blue-100 text-blue-800 border-blue-300',
  ready: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  served: 'bg-gray-100 text-gray-600 border-gray-300',
  cancelled: 'bg-red-100 text-red-800 border-red-300',
};

export const MENU_CATEGORIES = [
  { id: 'south-indian-breakfast', name: 'South Indian Breakfast', timing: '7AM - 11AM', icon: '🍳' },
  { id: 'soup', name: 'Soup', timing: '12PM - 10PM', icon: '🍲' },
  { id: 'lunch', name: 'Lunch', timing: '12PM - 3PM', icon: '🍛' },
  { id: 'biriyani', name: 'Biriyani', timing: '12PM - 3PM & 7PM - 10PM', icon: '🍚' },
  { id: 'mini-meals', name: 'Mini Meals', timing: '12PM - 3PM', icon: '🥘' },
  { id: 'tandoori-starters', name: 'Tandoori Starters', timing: '12PM - 3PM & 7PM - 10PM', icon: '🔥' },
  { id: 'chinese', name: 'Chinese', timing: '12PM - 3PM & 7PM - 10PM', icon: '🥡' },
  { id: 'rice-varieties', name: 'Rice Varieties', timing: '12PM - 10PM', icon: '🍜' },
  { id: 'breads', name: 'Breads', timing: '12PM - 3PM & 7PM - 10PM', icon: '🫓' },
  { id: 'parotta', name: 'Parotta', timing: '7PM - 10PM', icon: '🥞' },
  { id: 'gravy-curry', name: 'Gravy & Curry', timing: '7PM - 10PM', icon: '🫕' },
  { id: 'kids-menu', name: 'Kids Menu', timing: '11AM - 10PM', icon: '🍔' },
  { id: 'beverages', name: 'Beverages', timing: '6AM - 10PM', icon: '☕' },
  { id: 'evening-snacks', name: 'Evening Snacks', timing: '3PM - 7PM', icon: '🧆' },
  { id: 'chats', name: 'Chats', timing: '3PM - 10PM', icon: '🥙' },
];

export const DATA_RETENTION_DAYS = 60;
