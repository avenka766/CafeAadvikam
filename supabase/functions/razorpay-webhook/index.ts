import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const hex = (buffer: ArrayBuffer) => [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, '0')).join('');
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

Deno.serve(async (req) => {
  if (req.method !== 'POST') return json({ error: 'Method not allowed' }, 405);
  try {
    const secret = Deno.env.get('RAZORPAY_WEBHOOK_SECRET');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    if (!secret || !supabaseUrl || !serviceKey) throw new Error('Webhook service is not configured.');

    const raw = await req.text();
    const suppliedSignature = req.headers.get('x-razorpay-signature') || '';
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const expected = hex(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(raw)));
    if (!suppliedSignature || expected !== suppliedSignature) return json({ error: 'Invalid signature' }, 401);

    const event = JSON.parse(raw);
    const eventId = req.headers.get('x-razorpay-event-id') || event?.payload?.payment?.entity?.id || crypto.randomUUID();
    const supabase = createClient(supabaseUrl, serviceKey);
    const { error: eventInsertError } = await supabase.from('payment_webhook_events').insert({
      provider: 'razorpay', provider_event_id: eventId, event_type: event.event || 'unknown', payload: event,
    });
    if (eventInsertError?.code === '23505') return json({ ok: true, duplicate: true });
    if (eventInsertError) throw eventInsertError;

    const payment = event?.payload?.payment?.entity;
    const razorpayOrderId = payment?.order_id;
    if (!razorpayOrderId) {
      await supabase.from('payment_webhook_events').update({ status: 'ignored', processed_at: new Date().toISOString() }).eq('provider_event_id', eventId);
      return json({ ok: true, ignored: true });
    }

    if (event.event === 'payment.captured' || event.event === 'order.paid') {
      const { data: order, error: orderError } = await supabase.from('public_orders').select('*').eq('razorpay_order_id', razorpayOrderId).single();
      if (orderError || !order) throw new Error('Matching public order not found.');
      const now = new Date().toISOString();
      const { data: updated, error: updateError } = await supabase.from('public_orders').update({
        status: 'paid', payment_id: payment.id, paid_at: order.paid_at || now, updated_at: now,
      }).eq('id', order.id).neq('status', 'paid').select('id').maybeSingle();
      if (updateError) throw updateError;
      if (updated) {
        await supabase.from('admin_notifications').insert({
          recipient_role: 'admin', type: 'online_order_paid', title: 'New paid online order',
          body: `${order.order_number} · ${order.customer_name} · ₹${Number(order.amount).toFixed(2)}`,
          ref_id: order.id, ref_label: order.order_number, is_read: false,
          metadata: { source: 'razorpay_webhook', payment_id: payment.id, event_id: eventId },
        });
      }
    } else if (event.event === 'payment.failed') {
      await supabase.from('public_orders').update({ status: 'payment_failed', updated_at: new Date().toISOString() }).eq('razorpay_order_id', razorpayOrderId).eq('status', 'payment_pending');
    }

    await supabase.from('payment_webhook_events').update({ status: 'processed', processed_at: new Date().toISOString() }).eq('provider_event_id', eventId);
    return json({ ok: true });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : 'Unexpected error' }, 400);
  }
});
