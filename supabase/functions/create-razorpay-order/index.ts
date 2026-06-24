import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const body = await req.json();
    const amount = Number(body.amount);
    const customer = body.customer ?? {};
    const items = Array.isArray(body.items) ? body.items : [];
    const phone = String(customer.phone ?? '').replace(/\D/g, '');
    if (!Number.isInteger(amount) || amount < 100) throw new Error('Invalid amount.');
    if (!String(customer.name ?? '').trim() || phone.length !== 10 || !String(customer.address ?? '').trim() || !String(customer.locationPin ?? '').trim()) {
      throw new Error('Name, valid mobile, address and PIN are required.');
    }
    if (!items.length) throw new Error('Order has no items.');

    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const keySecret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!keyId || !keySecret || !supabaseUrl || !serviceKey) throw new Error('Payment service is not configured.');

    const supabase = createClient(supabaseUrl, serviceKey);
    const orderNumber = `WEB-${new Date().toISOString().slice(0,10).replaceAll('-','')}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
    const { data: row, error: insertError } = await supabase.from('public_orders').insert({
      order_number: orderNumber,
      customer_name: String(customer.name).trim(),
      customer_phone: phone,
      customer_address: String(customer.address).trim(),
      location_pin: String(customer.locationPin).trim(),
      notes: String(customer.note ?? '').trim() || null,
      items,
      amount: amount / 100,
      status: 'payment_pending',
    }).select('id').single();
    if (insertError) throw insertError;

    const auth = btoa(`${keyId}:${keySecret}`);
    const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Basic ${auth}` },
      body: JSON.stringify({ amount, currency: 'INR', receipt: orderNumber, notes: { public_order_id: row.id } }),
    });
    const rz = await rzRes.json();
    if (!rzRes.ok || !rz.id) {
      await supabase.from('public_orders').update({ status: 'payment_failed', updated_at: new Date().toISOString() }).eq('id', row.id);
      throw new Error(rz?.error?.description || 'Razorpay order creation failed.');
    }
    await supabase.from('public_orders').update({ razorpay_order_id: rz.id, updated_at: new Date().toISOString() }).eq('id', row.id);
    return new Response(JSON.stringify({ orderId: rz.id, publicOrderId: row.id, amount, keyId }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unexpected error' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
