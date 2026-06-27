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

    const keyId = Deno.env.get('RAZORPAY_KEY_ID');
    const secret = Deno.env.get('RAZORPAY_KEY_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!keyId || !secret || !supabaseUrl || !serviceKey) throw new Error('Payment service is not configured.');

    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${razorpay_order_id}|${razorpay_payment_id}`)));
    if (expected !== razorpay_signature) throw new Error('Invalid Razorpay signature.');

    const supabase = createClient(supabaseUrl, serviceKey);
    const { data: order, error: orderError } = await supabase.from('public_orders').select('*').eq('id', publicOrderId).eq('razorpay_order_id', razorpay_order_id).single();
    if (orderError || !order) throw new Error('Order record not found.');

    if (order.status === 'paid') {
      if (order.payment_id && order.payment_id !== razorpay_payment_id) throw new Error('Order is already linked to a different payment.');
      return new Response(JSON.stringify({ success: true, orderNumber: order.order_number, duplicate: true }), { headers: { ...cors, 'Content-Type': 'application/json' } });
    }

    // A valid checkout signature links the IDs but does not by itself prove that the
    // expected amount was captured. Resolve the payment from Razorpay before marking paid.
    const paymentResponse = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(razorpay_payment_id)}`, {
      headers: { Authorization: `Basic ${btoa(`${keyId}:${secret}`)}` },
    });
    const payment = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(payment?.error?.description || 'Unable to verify the payment with Razorpay.');
    const expectedPaise = Math.round(Number(order.amount) * 100);
    if (payment.order_id !== razorpay_order_id) throw new Error('Payment belongs to a different Razorpay order.');
    if (payment.currency !== 'INR' || Number(payment.amount) !== expectedPaise) throw new Error('Captured payment amount does not match the order total.');
    if (payment.status !== 'captured') throw new Error('Payment has not been captured yet. Please wait for confirmation.');

    const now = new Date().toISOString();
    const { data: updated, error: updateError } = await supabase.from('public_orders').update({
      status: 'paid', payment_id: razorpay_payment_id, payment_signature: razorpay_signature, paid_at: now, updated_at: now,
    }).eq('id', publicOrderId).eq('status', 'payment_pending').select('id').maybeSingle();
    if (updateError) throw updateError;
    if (!updated) throw new Error('Order payment state changed. Refresh before retrying.');

    await supabase.from('admin_notifications').insert({
      recipient_role: 'admin',
      type: 'online_order_paid',
      title: 'New paid online order',
      body: `${order.order_number} · ${order.customer_name} · ₹${Number(order.amount).toFixed(2)}`,
      ref_id: order.id,
      ref_label: order.order_number,
      is_read: false,
      metadata: { source: 'landing_page_verify', payment_id: razorpay_payment_id, amount_paise: payment.amount, currency: payment.currency },
    });

    return new Response(JSON.stringify({ success: true, orderNumber: order.order_number }), { headers: { ...cors, 'Content-Type': 'application/json' } });
  } catch (error) {
    return new Response(JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unexpected error' }), { status: 400, headers: { ...cors, 'Content-Type': 'application/json' } });
  }
});
