import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  try {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, publicOrderId } = await req.json();
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !publicOrderId) throw new Error('Missing payment verification fields.');

    const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || !supabaseUrl || !serviceKey) throw new Error('Payment service is not configured.');

    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${razorpay_order_id}|${razorpay_payment_id}`)));
    if (expected !== razorpay_signature) throw new Error('Invalid Razorpay signature.');

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: order, error: orderError } = await supabase.from('public_orders').select('*').eq('id', publicOrderId).eq('razorpay_order_id', razorpay_order_id).single();
    if (orderError || !order) throw new Error('Order record not found.');

    const now = new Date().toISOString();
    const { error: updateError } = await supabase.from('public_orders').update({
      status: 'paid', payment_id: razorpay_payment_id, payment_signature: razorpay_signature, paid_at: now, updated_at: now,
    }).eq('id', publicOrderId);
    if (updateError) throw updateError;

    await supabase.from('admin_notifications').insert({
      recipient_role: 'admin',
      type: 'online_order_paid',
      title: 'New paid online order',
      body: `${order.order_number} · ${order.customer_name} · ₹${Number(order.amount).toFixed(2)}`,
      ref_id: order.id,
      ref_label: order.order_number,
      is_read: false,
      metadata: { source: 'landing_page', payment_id: razorpay_payment_id },
    });

    return new Response(JSON.stringify({ success: true, orderNumber: order.order_number }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unexpected error' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
