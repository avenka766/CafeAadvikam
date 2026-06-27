import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const TAX_RATE = 3;
const roundMoney = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

type RequestedItem = { barcode: number; qty: number };
type CatalogueRow = { barcode: number | string; name: string; price: number | string; uom: string; category: string; active: boolean };

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'POST') return new Response(JSON.stringify({ error: 'Method not allowed.' }), { status: 405, headers: { ...cors, 'Content-Type': 'application/json' } });
  try {
    const body = await req.json();
    const customer = body.customer ?? {};
    const rawItems = Array.isArray(body.items) ? body.items : [];
    const phone = String(customer.phone ?? '').replace(/\D/g, '').slice(-10);
    if (!String(customer.name ?? '').trim() || !/^\d{10}$/.test(phone) || !String(customer.address ?? '').trim() || !String(customer.locationPin ?? '').trim()) throw new Error('Name, valid mobile, address and PIN are required.');
    if (!rawItems.length || rawItems.length > 100) throw new Error('Order must contain between 1 and 100 products.');

    const requested: RequestedItem[] = rawItems.map((raw: Record<string, unknown>) => {
      const barcode = Number(raw.barcode);
      const qty = Math.round(Number(raw.qty) * 1000) / 1000;
      if (!Number.isInteger(barcode) || barcode <= 0 || !Number.isFinite(qty) || qty <= 0 || qty > 50) throw new Error('One or more order items are invalid.');
      return { barcode, qty };
    });
    if (new Set(requested.map((item) => item.barcode)).size !== requested.length) throw new Error('Duplicate products are not allowed.');

    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!keyId || !keySecret || !supabaseUrl || !serviceKey) throw new Error('Payment service is not configured.');
    const supabase = createClient(supabaseUrl, serviceKey);

    const { data: catalogue, error: catalogError } = await supabase
      .from('branch_items')
      .select('barcode,name,price,uom,category,active')
      .eq('branch', 'VRSNB')
      .eq('active', true)
      .in('barcode', requested.map((item) => item.barcode));
    if (catalogError) throw new Error(`Unable to load the authorised product catalogue: ${catalogError.message}`);
    if ((catalogue ?? []).length !== requested.length) throw new Error('One or more products are unavailable or inactive. Refresh the menu and try again.');
    const byBarcode = new Map((catalogue as CatalogueRow[]).map((row) => [Number(row.barcode), row]));
    const items = requested.map((request) => {
      const row = byBarcode.get(request.barcode);
      if (!row) throw new Error('One or more products are unavailable.');
      const price = roundMoney(Number(row.price));
      if (!Number.isFinite(price) || price <= 0) throw new Error(`Invalid configured price for ${row.name}.`);
      return { barcode: request.barcode, name: row.name, price, unit: row.uom, category: row.category, venue: 'bakery', qty: request.qty };
    });

    const subtotal = roundMoney(items.reduce((sum, item) => sum + item.price * item.qty, 0));
    const taxAmount = roundMoney(subtotal * (TAX_RATE / 100));
    const total = roundMoney(subtotal + taxAmount);
    const amount = Math.round(total * 100);
    if (!Number.isInteger(amount) || amount < 100) throw new Error('Order total is invalid.');

    const orderNumber = `VRSNB-${new Date().toISOString().slice(0, 10).replaceAll('-', '')}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const { data: row, error: insertError } = await supabase.from('public_orders').insert({
      order_number: orderNumber,
      customer_name: String(customer.name).trim().slice(0, 120), customer_phone: phone,
      customer_address: String(customer.address).trim().slice(0, 500), location_pin: String(customer.locationPin).trim().slice(0, 500),
      notes: String(customer.note ?? '').trim().slice(0, 500) || null,
      delivery_slot: String(customer.deliverySlot ?? body?.notes?.deliverySlot ?? 'As soon as possible').trim().slice(0, 100),
      items, subtotal, tax_rate: TAX_RATE, tax_amount: taxAmount, amount: total, status: 'payment_pending',
    }).select('id').single();
    if (insertError) throw insertError;

    const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Basic ${btoa(`${keyId}:${keySecret}`)}` },
      body: JSON.stringify({ amount, currency: 'INR', receipt: orderNumber, notes: { public_order_id: row.id, source: 'vrsnb_customer_booking', tax_rate: `${TAX_RATE}%` } }),
    });
    const rz = await rzRes.json();
    if (!rzRes.ok || !rz.id) {
      await supabase.from('public_orders').update({ status: 'payment_failed', payment_failed_at: new Date().toISOString(), updated_at: new Date().toISOString() }).eq('id', row.id);
      throw new Error(rz?.error?.description || 'Razorpay order creation failed.');
    }
    await supabase.from('public_orders').update({ razorpay_order_id: rz.id, updated_at: new Date().toISOString() }).eq('id', row.id);
    return new Response(JSON.stringify({ orderId: rz.id, publicOrderId: row.id, orderNumber, amount, subtotal, taxAmount, taxRate: TAX_RATE, keyId, items }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
