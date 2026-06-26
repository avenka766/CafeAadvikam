import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const TAX_RATE = 3;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });

  try {
    const body = await req.json();
    const customer = body.customer ?? {};
    const inputItems = Array.isArray(body.items) ? body.items : [];
    const phone = String(customer.phone ?? '').replace(/\D/g, '').slice(-10);

    if (!String(customer.name ?? '').trim() || !/^\d{10}$/.test(phone) || !String(customer.address ?? '').trim() || !String(customer.locationPin ?? '').trim()) {
      throw new Error('Name, valid mobile, address and PIN are required.');
    }
    if (!inputItems.length || inputItems.length > 100) throw new Error('Order must contain between 1 and 100 products.');

    const items = inputItems.map((raw: Record<string, unknown>) => {
      const price = Number(raw.price);
      const qty = Number(raw.qty);
      const name = String(raw.name ?? '').trim().slice(0, 160);
      const venue = String(raw.venue ?? '').toLowerCase();
      if (!name || !Number.isFinite(price) || price <= 0 || !Number.isFinite(qty) || qty <= 0 || qty > 50) throw new Error('One or more order items are invalid.');
      if (venue !== 'bakery') throw new Error('Only VRSNB Bakery products can be ordered here.');
      return {
        barcode: Number(raw.barcode) || null,
        name,
        price: roundMoney(price),
        unit: String(raw.unit ?? 'Nos').slice(0, 20),
        category: String(raw.category ?? 'BAKERY').slice(0, 60),
        venue: 'bakery',
        qty: Math.round(qty * 100) / 100,
      };
    });

    const subtotal = roundMoney(items.reduce((sum: number, item: { price: number; qty: number }) => sum + item.price * item.qty, 0));
    const taxAmount = roundMoney(subtotal * (TAX_RATE / 100));
    const total = roundMoney(subtotal + taxAmount);
    const amount = Math.round(total * 100);
    if (!Number.isInteger(amount) || amount < 100) throw new Error('Order total is invalid.');

    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!keyId || !keySecret || !supabaseUrl || !serviceKey) throw new Error('Payment service is not configured.');

    const supabase = createClient(supabaseUrl, serviceKey);
    const orderNumber = `VRSNB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: row, error: insertError } = await supabase.from('public_orders').insert({
      order_number: orderNumber,
      customer_name: String(customer.name).trim().slice(0, 120),
      customer_phone: phone,
      customer_address: String(customer.address).trim().slice(0, 500),
      location_pin: String(customer.locationPin).trim().slice(0, 500),
      notes: String(customer.note ?? '').trim().slice(0, 500) || null,
      delivery_slot: String(customer.deliverySlot ?? body?.notes?.deliverySlot ?? 'As soon as possible').trim().slice(0, 100),
      items,
      subtotal,
      tax_rate: TAX_RATE,
      tax_amount: taxAmount,
      amount: total,
      status: 'payment_pending',
    }).select('id').single();
    if (insertError) throw insertError;

    const auth = btoa(`${keyId}:${keySecret}`);
    const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({
        amount,
        currency: 'INR',
        receipt: orderNumber,
        notes: { public_order_id: row.id, source: 'vrsnb_customer_booking', tax_rate: `${TAX_RATE}%` },
      }),
    });
    const rz = await rzRes.json();
    if (!rzRes.ok || !rz.id) {
      await supabase.from('public_orders').update({ status: 'payment_failed', payment_failed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
      throw new Error(rz?.error?.description || 'Razorpay order creation failed.');
    }

    await supabase.from('public_orders').update({ razorpay_order_id: rz.id, updated_at: new Date().toISOString() }).eq('id', row.id);
    return new Response(JSON.stringify({ orderId: rz.id, publicOrderId: row.id, orderNumber, amount, subtotal, taxAmount, taxRate: TAX_RATE, keyId }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
