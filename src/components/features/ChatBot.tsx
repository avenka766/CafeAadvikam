// src/components/features/ChatBot.tsx
// Drop this file into src/components/features/
// Then add <ChatBot /> anywhere in Landing.tsx (see instructions at bottom)

import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Phone, ShoppingBag, CalendarDays, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

// ─── Constants ────────────────────────────────────────────────────────────────

const CAFE_WA = '919095445444';
const BAKERY_PHONE = '+91 9095445444';
const MAPS_URL = 'https://www.google.com/maps/place/Cafe+Aadvikam/@12.808481,77.9602846,17z/data=!4m6!3m5!1s0x3baddf00120caa5f:0x7cf353554e2c66a9!8m2!3d12.808481!4d77.9628595!16s%2Fg%2F11z0zvhx9p';
const SNB_WEBSITE = 'https://www.snbbakery.in';

const MENU: Record<string, { timing: string; items: [string, number][] }> = {
  'South Indian Breakfast': { timing: '7AM–11AM', items: [['Idly (2pc)', 39], ['Plain Dosa', 55], ['Set Dosa (2pc)', 69], ['Mushroom Dosa', 89], ['Podi Dosa', 80], ['Ghee Dosa', 80], ['Sambar Vada', 40], ['Masala Dosa', 69], ['Ghee Pongal', 89], ['Vada (1pc)', 19], ['Lemon Rice', 69], ['Pulihora', 69], ['Tomato Bath', 69], ['Ghee Veg Upma', 79], ['Kesaribath', 39], ['Onion Uttapam', 59], ['Ghee Onion Uttapam', 89], ['Rice Bath', 69]] },
  'Soup': { timing: '12PM–10PM', items: [['Tomato Soup', 59], ['Corn Soup', 59], ['Hot n Sour Soup', 59], ['Lemon Coriander Soup', 59], ['Cream & Mushroom Soup', 79], ['Drum Stick Soup', 79]] },
  'Lunch': { timing: '12PM–3PM', items: [['Pappu Avakaya Rice', 89], ['Gongura Rice', 89], ['Rasam Rice', 79], ['Curd Rice', 79], ['Sambar Sadam', 89], ['Bisibelebath', 89]] },
  'Biriyani': { timing: '12PM–3PM & 7PM–10PM', items: [['Handi Biriyani', 169], ['Hyderabad Biriyani', 150], ['Tawa Biriyani', 140], ['Paneer Tikka Biriyani', 200], ['Jack Fruit Biriyani', 200], ['Veg Biriyani', 140]] },
  'Mini Meals': { timing: '12PM–3PM', items: [['Mini Meals', 110]] },
  'Tandoori Starters': { timing: '12PM–3PM & 7PM–10PM', items: [['Paneer Tikka', 140], ['Malai Paneer Tikka', 140], ['Mushroom Tikka', 120], ['Veg Sheek Kabab', 120], ['Achari Kabab', 130], ['Haryali Kabab', 130], ['Soya Chop Kabab', 140], ['Harabara Kabab', 120], ['Stuffed Tandoori Aloo', 189], ['Grilled Corn', 110], ['Tandoori Platter', 190], ['Pineapple Tandoori', 160], ['Tandoori Momos', 110]] },
  'Chinese': { timing: '12PM–3PM & 7PM–10PM', items: [['Veg Manchurian', 99], ['Gobi Manchurian', 90], ['Paneer Manchurian', 110], ['Mushroom Manchurian', 99], ['Baby Corn Manchurian', 99], ['Chilli Paneer', 120], ['Chilli Gobi', 110], ['Chilli Mushroom', 110], ['Paneer 65 Dry', 120], ['Gobi 65 Dry', 90], ['Baby Corn 65 Dry', 110], ['Masala Pepper Corn', 110], ['Crispy Mix Vegetables', 79], ['Veg Ball Manchurian', 80]] },
  'Rice & Noodles': { timing: '12PM–10PM', items: [['Veg Fried Rice', 110], ['Paneer Fried Rice', 130], ['Gobi Fried Rice', 130], ['Mushroom Fried Rice', 130], ['Veg Schezwan Fried Rice', 130], ['Veg Noodles', 110], ['Paneer Noodles', 130], ['Mushroom Noodles', 130], ['Gobi Noodles', 130], ['SNB Special Triple Rice', 189], ['Jeera Rice', 110], ['Ghee Rice', 110], ['Green Peas Pulav', 130], ['Veg Pulav', 130]] },
  'Breads': { timing: '12PM–3PM & 7PM–10PM', items: [['Plain Naan', 40], ['Butter Naan', 45], ['Garlic Naan', 45], ['Roti', 30], ['Butter Roti', 35], ['Stuffed Paratha', 45], ['Stuffed Onion Paratha', 50], ['Stuffed Paneer Paratha', 65], ['Kashmiri Naan', 60], ['Plain Kulcha', 45], ['Stuffed Kulcha', 70], ['Aloo Paratha', 90]] },
  'Parotta': { timing: '7PM–10PM', items: [['Kottu Parotta + Kurma', 79], ['Fried Parotta + Kurma', 70], ['Potlam Parotta + Kurma', 130], ['Noolu Parotta + Kurma', 50], ['Parotta + Kurma', 40], ['Bun Parotta + Kurma', 60]] },
  'Gravy & Curry': { timing: '7PM–10PM', items: [['Paneer Tikka Masala', 170], ['Paneer Butter Masala', 160], ['Palak Paneer', 160], ['Mix Veg Kadai', 160], ['Mix Veg Kolhapuri', 170], ['Palak Dal', 140], ['Dal Tadka', 140], ['Mushroom Masala', 160], ['Veg Kurma', 160], ['Dal Makhani', 160], ['Kadai Paneer', 160], ['Kadai Mushroom Masala', 160], ['Aloo Matar Subzi', 160]] },
  'Kids Menu': { timing: '11AM–10PM', items: [['Veg Burger', 70], ['Veg Cheese Grilled Burger', 80], ['Sandwich', 70], ['Bombay Triple Sandwich', 99], ['Cheese Grilled Sandwich', 99], ['French Fries', 70], ['Honey Chilli Potato', 99], ['Corn Cheese Ball', 99], ['Pizza', 99], ['Veg Corn Pizza', 120], ['Veg Cheese Pizza', 120], ['Veg Paneer Tikka Pizza', 139], ['Veg Farmhouse Pizza', 139], ['Veg Momos', 99]] },
  'Beverages': { timing: '6AM–10PM', items: [['Tea', 20], ['Coffee', 30], ['Badam Milk Hot & Cold', 30], ['Ice Tea', 40], ['Lemon Tea', 20], ['Tandoori Tea', 25], ['Black Tea', 20], ['Lassi Plain', 60], ['Mango Lassi', 70], ['Gulab Shake', 70], ['Masala Shikanji', 50], ['Badam Milk', 70], ['Rose Milk', 60], ['Butter Milk', 60]] },
  'Evening Snacks': { timing: '3PM–7PM', items: [['Mirchi Bajji (2pc)', 45], ['Banana Bajji (2pc)', 45], ['Onion Bonda', 45], ['Masala Mirchi Bajji', 49], ['Aloo Bonda', 40], ['Mix Bajji', 60]] },
  'Chats': { timing: '3PM–10PM', items: [['Pani Puri', 40], ['Masala Puri', 40], ['Dahi Puri', 50], ['Pav Bhaji', 70], ['Chole Bhature', 80], ['Vada Pav (2pc)', 50], ['Dabeli', 50], ['Raj Kachori', 60], ['Papdi Chat', 50], ['Bhel Puri', 50], ['Congress Masala', 50]] },
};

const BAKERY: Record<string, string[]> = {
  Sweets: ['Mysore Pak', 'Spl Mysore Pak', 'Ragi Mysore Pak', 'Millet Mix Mysore Pak', 'Coconut Burfi', 'Peanut Burfi', 'Boost Burfi', 'Horlicks Burfi', 'Soan Papdi', 'Dryfruit Halwa', 'Carrot Halwa', 'Bombay Halwa', 'Milk Halwa', 'Boondhi Laadu', 'Rava Laadu', 'Thirupathi Laadu', 'Kaju Pista Laadu', 'Jelabi', 'Jangiri', 'Mini Badusha', 'Chandrakala', 'Jamoon', 'Peda', 'Kaju Chikki', 'Dryfruit Chikkies', 'Oppat', 'Sweet Boondhi', 'Vanilla Bites', 'Chocolate Bites'],
  Savouries: ['Masala Cashew', 'Pepper Cashew', 'Regular Nippat', 'Garlic Nippat', 'Ragi Nippat', 'Pakoda', 'Cashew Pakoda', 'Finger Chips', 'Potato Chips', 'Banana Chips', 'Kachori', 'Samosa', 'Regular Mixture', 'Bombay Mixture', 'SNB Special Mixture', 'Ragi Mixture', 'Kara Boondhi', 'Chana Dal', 'Mix Dal', 'Till Muruk', 'Ribbon Muruk', 'Mullu Muruk', 'Beetroot Muruk', 'Onion Muruk', 'Garlic Muruk', 'Ragi Muruk', 'Om Pudi', 'Mota Sev', 'Madur Vada', 'Athirasam'],
  Bakery: ['Bread', 'Bun', 'Masala Bun', 'Coconut Bun', 'Rusk', 'Butter Rusk', 'Wheat Bread', 'Pav Bread', 'Plain Cake', 'Banana Cake', 'Carrot Cake', 'Black Forest', 'Brownie', 'Muffins', 'Croissant', 'Veg Roll', 'Cutlet', 'French Macaroons', 'Vanilla Sponge', 'Eggless Vanilla Sponge', 'Chocolate Sponge', 'Red Velvet Sponge'],
  Cookies: ['Salt Biscuit', 'Kara Biscuit', 'Coconut Biscuit', 'Groundnut Biscuit', 'Butter Biscuit'],
};

// ─── Types ────────────────────────────────────────────────────────────────────

interface Message {
  id: number;
  role: 'bot' | 'user';
  text: string;
  time: string;
}

interface ContactForm {
  name: string;
  phone: string;
  type: string;
  details: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function nowStr() {
  return new Date().toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

function openWA(msg: string) {
  window.open(`https://wa.me/${CAFE_WA}?text=${encodeURIComponent(msg)}`, '_blank');
}

// ─── Response Engine ──────────────────────────────────────────────────────────

function getResponse(q: string): string {
  const ql = q.toLowerCase();

  const menuSection = (cat: string, max?: number) => {
    const v = MENU[cat];
    const items = max ? v.items.slice(0, max) : v.items;
    const rows = items.map(([n, p]) => `• ${n} — ₹${p}`).join('\n');
    const extra = max && v.items.length > max ? `\n  ...and ${v.items.length - max} more` : '';
    return `📋 ${cat} (${v.timing})\n${rows}${extra}`;
  };

  if (/hello|hi |hey|namaste|good morning|good evening|start/i.test(ql))
    return 'Vanakkam! 🙏 Welcome to Cafe Aadvikam — pure veg Restaurant & Party Hall, Berikai.\n\nAsk me about our menu & prices, bakery sweets & savouries, or party hall booking!';

  if (/order.*online|how.*order|place.*order|delivery|takeaway|online/i.test(ql))
    return 'You can order in 3 easy ways:\n\n1. 💬 WhatsApp — +91 90954 45444\n2. 📞 Call — +91 9095445444\n3. 🚶 Walk in — 109 Bagalur Main Road, Berikai\n\nFor bakery items, WhatsApp a day in advance!';

  if (/location|address|where|map|direction|berikai|how to reach/i.test(ql))
    return '📍 Cafe Aadvikam\n109 Bagalur Main Road, Berikai 635105\n\n⏰ Open 6 AM – 10 PM daily\n\nAmple parking available!';

  if (/hour|timing|time|open|close|when/i.test(ql) && !/menu|breakfast|lunch|biryani|chinese|rice|bread|snack|beverage/i.test(ql))
    return '⏰ Open 6 AM – 10 PM every day.\n\n• Breakfast: 7AM–11AM\n• Beverages: 6AM–10PM\n• Lunch: 12PM–3PM\n• Biriyani, Chinese, Starters: 12PM–3PM & 7PM–10PM\n• Rice & Noodles: 12PM–10PM\n• Evening Snacks & Chats: 3PM–10PM\n• Parotta & Gravy: 7PM–10PM\n• Kids Menu: 11AM–10PM';

  if (/party hall|party|hall|event|birthday|celebrate|function|corporate|book.*hall|reception/i.test(ql))
    return '🎉 Party Hall — Cafe Aadvikam\n\nPerfect for:\n• Birthday parties\n• Family gatherings\n• Corporate events\n• Receptions & celebrations\n\n✅ Spacious hall with ample parking\n✅ Pure veg catering from our kitchen\n✅ Customisable arrangements\n\n📍 109 Bagalur Main Road, Berikai\n\nTap "Book Party Hall" below to send your details via WhatsApp!';

  if (/contact|enquir|reach.*us|get.*touch/i.test(ql))
    return '📞 +91 9095445444\n💬 WhatsApp: +91 90954 45444\n🌐 www.snbbakery.in\n📍 109 Bagalur Main Road, Berikai 635105';

  if (/about|who are|what is cafe|aadvikam|vrsnb/i.test(ql))
    return 'Cafe Aadvikam — Restaurant & Party Hall\n\nA pure vegetarian restaurant serving authentic South Indian breakfast, North Indian cuisine, Chinese dishes, and freshly baked goods.\n\n• Type: Pure Vegetarian 🌿\n• Hours: 6 AM – 10 PM Daily\n• Address: 109 Bagalur Main Road, Berikai 635105\n• Venture of: VRSNB Foods LLP\n• Website: www.snbbakery.in';

  if (/breakfast|idly|dosa|vada|pongal|upma|uttapam|kesari/i.test(ql))
    return menuSection('South Indian Breakfast');
  if (/\bsoup\b/i.test(ql))
    return menuSection('Soup');
  if (/\blunch\b|curd rice|rasam|sambar sadam|bisibele|gongura/i.test(ql))
    return menuSection('Lunch');
  if (/biryani|biriyani|handi|hyderabad biryani|jackfruit|jack fruit/i.test(ql))
    return menuSection('Biriyani') + '\n\nAll pure veg, made fresh to order! 🍚';
  if (/tandoori|tikka|kabab|starter|grilled corn/i.test(ql))
    return menuSection('Tandoori Starters');
  if (/\bchinese\b|manchurian|chilli paneer|chilli gobi|65 dry/i.test(ql))
    return menuSection('Chinese');
  if (/fried rice|noodle|jeera rice|ghee rice|pulav|triple rice/i.test(ql))
    return menuSection('Rice & Noodles');
  if (/\bnaan\b|roti|paratha|kulcha/i.test(ql) && !/parotta/i.test(ql))
    return menuSection('Breads');
  if (/parotta|kottu|potlam|noolu/i.test(ql))
    return menuSection('Parotta') + '\n\nAll served with Kurma!';
  if (/gravy|curry|paneer butter|palak|dal tadka|dal makhani|kadai/i.test(ql))
    return menuSection('Gravy & Curry');
  if (/mini meal/i.test(ql))
    return '🍛 Mini Meals — ₹110\n\nAvailable 12PM–3PM. A complete meal with rice, sambar, rasam, vegetables and sides. Great value!';
  if (/kids|burger|pizza|sandwich|french fries|honey chilli/i.test(ql))
    return menuSection('Kids Menu');
  if (/beverage|drink|\btea\b|coffee|lassi|milk|shake|buttermilk/i.test(ql))
    return menuSection('Beverages');
  if (/snack|bajji|bonda|evening snack/i.test(ql))
    return menuSection('Evening Snacks');
  if (/pani puri|pav bhaji|chole|vada pav|dabeli|bhel|papdi|\bchats?\b/i.test(ql))
    return menuSection('Chats');

  if (/full menu|entire menu|all menu|complete menu|what.*serve|what food/i.test(ql)) {
    return Object.entries(MENU).map(([cat, v]) =>
      `${cat} (${v.timing}) — ${v.items.length} items · ₹${Math.min(...v.items.map(x => x[1]))}–₹${Math.max(...v.items.map(x => x[1]))}`
    ).join('\n') + '\n\nAsk about any category for the full list!';
  }

  if (/bakery|sweet|muruk|mixture|nippat|chikki|halwa|laadu|burfi|mysore pak|savouri|cookie|biscuit|cake|muffin|brownie/i.test(ql)) {
    return Object.entries(BAKERY).map(([cat, items]) =>
      `🏷️ ${cat}\n${items.slice(0, 8).join(', ')}${items.length > 8 ? ` +${items.length - 8} more` : ''}`
    ).join('\n\n') + '\n\nPrices per kg. WhatsApp for current rates & advance orders!';
  }

  if (/cheap|budget|affordable|under 50|cheapest|lowest/i.test(ql))
    return 'Budget-friendly picks 💰\n\n• Vada (1pc) — ₹19\n• Tea / Lemon Tea — ₹20\n• Roti — ₹30\n• Kesaribath / Sambar Vada — ₹39–40\n• Parotta + Kurma — ₹40\n• Pani Puri / Masala Puri — ₹40\n• Evening Bajjis — ₹40–60\n• Plain Dosa — ₹55';

  if (/paneer/i.test(ql))
    return 'Popular paneer dishes (100% pure veg!) 🧀\n\n• Paneer Tikka / Malai Paneer Tikka — ₹140\n• Paneer Manchurian — ₹110\n• Chilli Paneer — ₹120\n• Paneer Fried Rice / Noodles — ₹130\n• Paneer Butter Masala — ₹160\n• Paneer Tikka Masala — ₹170\n• Paneer Tikka Biriyani — ₹200\n• Stuffed Paneer Paratha — ₹65';

  if (/price|cost|how much|rate/i.test(ql))
    return 'Price ranges at Cafe Aadvikam 💰\n\n• Breakfast: ₹19–₹89\n• Soups: ₹59–₹79\n• Lunch: ₹79–₹89\n• Biriyani: ₹140–₹200\n• Tandoori Starters: ₹110–₹190\n• Chinese: ₹79–₹120\n• Rice & Noodles: ₹110–₹189\n• Breads: ₹30–₹90\n• Gravy & Curry: ₹140–₹170\n• Beverages: ₹20–₹70\n\nAsk about a specific dish for exact price!';

  if (/thank|thanks|great|awesome|helpful/i.test(ql))
    return 'You\'re welcome! 😊 Hope to see you at Cafe Aadvikam soon.\n\n📍 109 Bagalur Main Road, Berikai · ⏰ 6AM–10PM daily';

  for (const cat of Object.keys(MENU)) {
    if (ql.includes(cat.toLowerCase().split(' ')[0]) || ql.includes(cat.toLowerCase()))
      return menuSection(cat);
  }

  return 'I can help you with:\n\n🍽️ Menu — Breakfast, Lunch, Biriyani, Chinese, Parotta, Starters, Rice, Breads, Gravy, Kids, Snacks, Chats, Beverages\n\n🍬 Bakery — Sweets, Savouries, Cookies, Baked goods\n\n🎉 Party Hall — Booking & enquiries\n\n📍 Location & Hours\n\nTry: "Show me the biriyani menu" or "How to book party hall?"';
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function MessageBubble({ msg }: { msg: Message }) {
  const isBot = msg.role === 'bot';
  return (
    <div className={cn('flex flex-col gap-1 max-w-[85%]', isBot ? 'self-start' : 'self-end')}>
      <div
        className={cn(
          'px-3 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-line',
          isBot
            ? 'bg-orange-50 text-gray-800 rounded-bl-sm border border-orange-100'
            : 'bg-[#8B4513] text-white rounded-br-sm',
        )}
      >
        {isBot
          ? <span dangerouslySetInnerHTML={{ __html: msg.text }} />
          : msg.text
        }
      </div>
      <span className={cn('text-[10px] text-gray-400 px-1', !isBot && 'self-end')}>{msg.time}</span>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="self-start flex gap-1 items-center px-4 py-3 bg-orange-50 rounded-2xl rounded-bl-sm border border-orange-100">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-bounce"
          style={{ animationDelay: `${i * 0.2}s` }}
        />
      ))}
    </div>
  );
}

// ─── Contact Form Modal ───────────────────────────────────────────────────────

function ContactModal({ onClose, onSubmit }: { onClose: () => void; onSubmit: (f: ContactForm) => void }) {
  const [form, setForm] = useState<ContactForm>({ name: '', phone: '', type: 'Party Hall Booking', details: '' });
  const [phoneError, setPhoneError] = useState('');

  const validatePhone = (phone: string) => {
    const digits = phone.replace(/\D/g, '');
    // Accept 10-digit Indian numbers, or with +91/91 prefix (12 or 13 digits)
    if (digits.length === 10 && /^[6-9]/.test(digits)) return true;
    if (digits.length === 12 && digits.startsWith('91') && /^[6-9]/.test(digits.slice(2))) return true;
    return false;
  };

  const handleSubmit = () => {
    if (!form.name.trim()) { setPhoneError(''); alert('Please enter your name.'); return; }
    if (!form.phone.trim()) { setPhoneError('Please enter your phone number.'); return; }
    if (!validatePhone(form.phone)) { setPhoneError('Enter a valid 10-digit Indian mobile number (e.g. 98765 43210)'); return; }
    setPhoneError('');
    onSubmit(form);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-1">
          <h3 className="font-semibold text-gray-800">Book Party Hall / Enquiry</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="size-5" /></button>
        </div>
        <p className="text-xs text-gray-500 mb-4">Your details will be sent to us via WhatsApp for a quick response.</p>

        <div className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Your Name</label>
            <input className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400" placeholder="e.g. Ravi Kumar" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Phone Number</label>
            <input className={`w-full border rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 ${phoneError ? 'border-red-400 bg-red-50' : 'border-gray-200'}`} placeholder="e.g. 98765 43210" type="tel" value={form.phone} onChange={e => { setForm(f => ({ ...f, phone: e.target.value })); setPhoneError(''); }} />
            {phoneError && <p className="text-xs text-red-500 mt-1 flex items-center gap-1">⚠️ {phoneError}</p>}
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Enquiry Type</label>
            <select className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 bg-white" value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))}>
              <option>Party Hall Booking</option>
              <option>Menu Enquiry</option>
              <option>Bakery Order</option>
              <option>General Enquiry</option>
            </select>
          </div>
          <div>
            <label className="text-xs font-semibold text-gray-500 mb-1 block">Date / Details</label>
            <textarea className="w-full border border-gray-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-orange-400 resize-none" rows={3} placeholder="Event date, number of guests, special requests…" value={form.details} onChange={e => setForm(f => ({ ...f, details: e.target.value }))} />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm border border-gray-200 text-gray-600 hover:bg-gray-50">Cancel</button>
          <button onClick={handleSubmit} className="flex-1 py-2.5 rounded-xl text-sm bg-[#25D366] text-white font-semibold hover:bg-[#1da851] flex items-center justify-center gap-1.5">
            <MessageCircle className="size-4" />Send via WhatsApp
          </button>
        </div>
      </div>
    </div>
  );
}

// ─── Order Modal ──────────────────────────────────────────────────────────────

function OrderModal({ onClose }: { onClose: () => void }) {
  const options = [
    { icon: '💬', label: 'Order via WhatsApp', sub: 'Chat to place your order', action: () => openWA('Hi, I want to place an order at Cafe Aadvikam'), bg: 'bg-green-50' },
    { icon: '📞', label: 'Call to Order', sub: BAKERY_PHONE, action: () => window.open(`tel:${BAKERY_PHONE}`), bg: 'bg-amber-50' },
    { icon: '📍', label: 'Dine In / Visit Us', sub: '109 Bagalur Main Road, Berikai · 6AM–10PM', action: () => window.open(MAPS_URL, '_blank'), bg: 'bg-red-50' },
    { icon: '🌐', label: 'SNB Bakery Website', sub: 'www.snbbakery.in', action: () => window.open(SNB_WEBSITE, '_blank'), bg: 'bg-purple-50' },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/50" onClick={onClose}>
      <div className="bg-white rounded-2xl w-full max-w-sm p-5 shadow-xl" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-gray-800">Order / Visit Options</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600"><X className="size-5" /></button>
        </div>
        <div className="space-y-2">
          {options.map(opt => (
            <button key={opt.label} onClick={() => { opt.action(); onClose(); }} className="w-full flex items-center gap-3 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 text-left transition-colors">
              <div className={cn('w-10 h-10 rounded-full flex items-center justify-center text-xl flex-shrink-0', opt.bg)}>{opt.icon}</div>
              <div>
                <p className="text-sm font-medium text-gray-800">{opt.label}</p>
                <p className="text-xs text-gray-500">{opt.sub}</p>
              </div>
              <ChevronRight className="size-4 text-gray-400 ml-auto flex-shrink-0" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ─── Main ChatBot Component ───────────────────────────────────────────────────

const QUICK_CHIPS = [
  { label: 'Breakfast menu', q: 'Show me the breakfast menu' },
  { label: 'Biryani', q: 'What biryani do you have?' },
  { label: 'Bakery items', q: 'Tell me about bakery items' },
  { label: 'Party hall', q: 'How to book the party hall?' },
  { label: 'Beverages', q: 'Show me beverages' },
  { label: 'Full menu', q: 'Show full menu overview' },
  { label: 'Order online', q: 'How to order online?' },
];

export default function ChatBot() {
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([
    { id: 0, role: 'bot', text: 'Vanakkam! 🙏 Welcome to <strong>Cafe Aadvikam</strong> — pure veg Restaurant & Party Hall, Berikai.\n\nAsk me about our menu & prices, bakery, or party hall booking!', time: nowStr() },
  ]);
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [showContact, setShowContact] = useState(false);
  const [showOrder, setShowOrder] = useState(false);
  // MOB-03: track keyboard height so the chat panel lifts above the keyboard
  const [keyboardOffset, setKeyboardOffset] = useState(0);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 300);
  }, [open]);

  // MOB-03: listen to visualViewport resize to detect soft keyboard
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const onResize = () => {
      const keyboardH = window.innerHeight - vv.height - vv.offsetTop;
      setKeyboardOffset(Math.max(0, keyboardH));
    };
    vv.addEventListener('resize', onResize);
    vv.addEventListener('scroll', onResize);
    return () => { vv.removeEventListener('resize', onResize); vv.removeEventListener('scroll', onResize); };
  }, []);

  const sendMsg = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setInput('');

    const userMsg: Message = { id: Date.now(), role: 'user', text: q, time: nowStr() };
    setMessages(prev => [...prev, userMsg]);
    setTyping(true);

    setTimeout(() => {
      setTyping(false);
      const botMsg: Message = { id: Date.now() + 1, role: 'bot', text: getResponse(q), time: nowStr() };
      setMessages(prev => [...prev, botMsg]);
    }, 500 + Math.random() * 400);
  };

  const handleContactSubmit = (form: ContactForm) => {
    const waText = `Hi Cafe Aadvikam! 🙏\n\n*${form.type}*\nName: ${form.name}\nPhone: ${form.phone}${form.details ? '\nDetails: ' + form.details : ''}`;
    openWA(waText);
    const confirmMsg: Message = {
      id: Date.now(),
      role: 'bot',
      text: `Your <strong>${form.type}</strong> details have been sent via WhatsApp! We'll get back to you on <strong>${form.phone}</strong> shortly. 🙏`,
      time: nowStr(),
    };
    setMessages(prev => [...prev, confirmMsg]);
  };

  return (
    <>
      {/* Floating toggle button — z-50 (U-18: was z-40, covered by modals) */}
      <button
        onClick={() => setOpen(o => !o)}
        className={cn(
          'fixed right-4 z-50 w-14 h-14 rounded-full shadow-lg flex items-center justify-center transition-all duration-300',
          'bg-[#8B4513] text-white hover:bg-[#6b3310] active:scale-95',
        )}
        style={{ bottom: `calc(5rem + ${keyboardOffset}px)` }}
        aria-label="Open chat"
      >
        {open ? <X className="size-6" /> : <MessageCircle className="size-6" />}
        {!open && (
          <span className="absolute -top-1 -right-1 w-4 h-4 bg-green-500 rounded-full border-2 border-white" />
        )}
      </button>

      {/* Chat window — z-50, repositions above keyboard (MOB-03) */}
      <div
        className={cn(
          'fixed right-4 z-50 w-[340px] max-w-[calc(100vw-2rem)] flex flex-col',
          'bg-white rounded-2xl shadow-2xl border border-gray-100 overflow-hidden',
          'transition-all duration-300 origin-bottom-right',
          open ? 'opacity-100 scale-100 pointer-events-auto' : 'opacity-0 scale-95 pointer-events-none',
        )}
        style={{ bottom: `calc(9rem + ${keyboardOffset}px)`, height: '520px' }}
      >
        {/* Header */}
        <div className="bg-[#8B4513] px-4 py-3 flex items-center gap-3 flex-shrink-0">
          <div className="w-9 h-9 rounded-full bg-white/20 flex items-center justify-center text-lg flex-shrink-0">☕</div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-semibold text-sm leading-tight">Cafe Aadvikam</p>
            <p className="text-white/70 text-xs">Restaurant & Party Hall · Berikai</p>
          </div>
          <button
            onClick={() => openWA('Hi, I have an enquiry about Cafe Aadvikam')}
            className="flex items-center gap-1 bg-[#25D366] text-white text-xs px-2.5 py-1.5 rounded-full font-medium hover:bg-[#1da851]"
          >
            <MessageCircle className="size-3" />WA
          </button>
          <button onClick={() => setOpen(false)} className="text-white/70 hover:text-white ml-1">
            <X className="size-5" />
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-3 py-3 flex flex-col gap-2.5 bg-gray-50/50">
          {messages.map(msg => <MessageBubble key={msg.id} msg={msg} />)}
          {typing && <TypingIndicator />}
          <div ref={messagesEndRef} />
        </div>

        {/* Action bar */}
        <div className="px-3 py-2 flex gap-2 border-t border-gray-100 bg-white flex-shrink-0 overflow-x-auto">
          <button onClick={() => openWA('Hi, I have an enquiry about Cafe Aadvikam')} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#25D366] text-white rounded-full font-medium whitespace-nowrap hover:bg-[#1da851]">
            <MessageCircle className="size-3" />WhatsApp
          </button>
          <button onClick={() => setShowOrder(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-[#8B4513] text-white rounded-full font-medium whitespace-nowrap hover:bg-[#6b3310]">
            <ShoppingBag className="size-3" />Order
          </button>
          <button onClick={() => setShowContact(true)} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-full whitespace-nowrap hover:bg-gray-50">
            <CalendarDays className="size-3" />Book Hall
          </button>
          <a href={`tel:${BAKERY_PHONE}`} className="flex items-center gap-1.5 text-xs px-3 py-1.5 border border-gray-200 text-gray-600 rounded-full whitespace-nowrap hover:bg-gray-50">
            <Phone className="size-3" />Call
          </a>
        </div>

        {/* Quick chips */}
        <div className="px-3 py-1.5 flex gap-1.5 overflow-x-auto bg-white border-t border-gray-100 flex-shrink-0">
          {QUICK_CHIPS.map(c => (
            <button key={c.label} onClick={() => sendMsg(c.q)} className="text-xs px-2.5 py-1 border border-gray-200 rounded-full whitespace-nowrap text-gray-600 hover:bg-gray-50 flex-shrink-0">
              {c.label}
            </button>
          ))}
        </div>

        {/* Input */}
        <div className="px-3 py-2.5 flex gap-2 border-t border-gray-100 bg-white flex-shrink-0">
          <input
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && sendMsg()}
            placeholder="Ask about menu, prices, party hall…"
            className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-xl outline-none focus:border-orange-400 bg-white"
          />
          <button
            onClick={() => sendMsg()}
            className="w-9 h-9 flex items-center justify-center bg-[#8B4513] text-white rounded-xl hover:bg-[#6b3310] flex-shrink-0"
          >
            <Send className="size-4" />
          </button>
        </div>
      </div>

      {showContact && <ContactModal onClose={() => setShowContact(false)} onSubmit={handleContactSubmit} />}
      {showOrder && <OrderModal onClose={() => setShowOrder(false)} />}
    </>
  );
}

/*
─── HOW TO INTEGRATE INTO Landing.tsx ───────────────────────────────────────

1. Copy this file to:
   src/components/features/ChatBot.tsx

2. In src/pages/Landing.tsx, add the import at the top:
   import ChatBot from '@/components/features/ChatBot';

3. Inside the Landing component's return, add <ChatBot /> just before
   the closing </div> of the root element (right before the existing
   {showMenu && <MenuPopup ...>} lines):

   ...
   {showMenu && <MenuPopup onClose={() => setShowMenu(false)} />}
   {drawerCat && <CategoryDrawer catId={drawerCat} onClose={() => setDrawerCat(null)} />}
   {partyFullscreen && <PartyHallViewer onClose={() => setPartyFullscreen(false)} />}
   <ChatBot />     ← ADD THIS LINE
 </div>

That's it — no other changes needed!
─────────────────────────────────────────────────────────────────────────────
*/
