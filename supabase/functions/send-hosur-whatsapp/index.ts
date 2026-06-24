import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type RequestBody = {
  phone?: string;
  message?: string;
  mediaUrl?: string | null;
  mediaType?: "image" | null;
  fileName?: string | null;
  shopId?: string | null;
  billId?: string | null;
  billNo?: string | null;
  messageType?: "bill" | "reminder" | "manual";
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeIndianPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 12 && digits.startsWith("91")) return digits;
  return digits;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    const phone = normalizeIndianPhone(body.phone ?? "");
    const message = (body.message ?? "").trim();

    if (!phone || phone.length < 10) return json({ error: "A valid WhatsApp phone number is required." }, 400);
    if (!message) return json({ error: "Message text is required." }, 400);

    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";

    if (!accessToken || !phoneNumberId) {
      return json({
        error: "WhatsApp Cloud API is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID secrets.",
      }, 500);
    }

    const hasImage = body.mediaType === "image" && Boolean(body.mediaUrl);
    const payload = hasImage
      ? {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "image",
          image: {
            link: body.mediaUrl,
            caption: message.slice(0, 1024),
          },
        }
      : {
          messaging_product: "whatsapp",
          recipient_type: "individual",
          to: phone,
          type: "text",
          text: { preview_url: true, body: message.slice(0, 4096) },
        };

    const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const result = await response.json();
    if (!response.ok) {
      return json({ error: result?.error?.message ?? "WhatsApp send failed", details: result }, response.status);
    }

    return json({
      ok: true,
      messageId: result?.messages?.[0]?.id ?? null,
      sentAs: hasImage ? "image_with_caption" : "text",
      billNo: body.billNo ?? null,
      messageType: body.messageType ?? "manual",
    });
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Unexpected WhatsApp send error" }, 500);
  }
});
