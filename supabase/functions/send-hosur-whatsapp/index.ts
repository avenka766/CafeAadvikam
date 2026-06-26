import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  // The web client deliberately adds x-cafe-session and x-client-app to every
  // Supabase request. They must be allowed here or the browser stops at OPTIONS
  // and never sends the POST request.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cafe-session, x-client-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
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

type ProviderResult = {
  ok: boolean;
  status: number;
  data: Record<string, unknown>;
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

function providerError(data: Record<string, unknown>) {
  const error = data.error as Record<string, unknown> | undefined;
  return String(error?.message ?? "WhatsApp send failed");
}

async function sendProviderRequest(url: string, accessToken: string, payload: Record<string, unknown>): Promise<ProviderResult> {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  let data: Record<string, unknown> = {};
  try {
    data = await response.json();
  } catch {
    data = { error: { message: `WhatsApp provider returned HTTP ${response.status}.` } };
  }
  return { ok: response.ok, status: response.status, data };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    const phone = normalizeIndianPhone(body.phone ?? "");
    const message = (body.message ?? "").trim();

    if (!/^91\d{10}$/.test(phone)) {
      return json({ ok: false, error: "Enter a valid 10-digit Indian WhatsApp number." }, 400);
    }
    if (!message) return json({ ok: false, error: "Message text is required." }, 400);

    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";

    if (!accessToken || !phoneNumberId) {
      return json({
        ok: false,
        error: "WhatsApp Cloud API is not configured. Add WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID secrets.",
      }, 500);
    }

    const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const hasImage = body.mediaType === "image" && Boolean(body.mediaUrl);
    const imagePayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "image",
      image: {
        link: body.mediaUrl,
        caption: message.slice(0, 1024),
      },
    };
    const textPayload: Record<string, unknown> = {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: {
        preview_url: true,
        body: `${message}${hasImage && body.mediaUrl ? `\n\nPayment QR: ${body.mediaUrl}` : ""}`.slice(0, 4096),
      },
    };

    let provider = await sendProviderRequest(endpoint, accessToken, hasImage ? imagePayload : textPayload);
    let fallbackUsed = false;
    let imageError: string | null = null;

    // Public preview deployments or protected asset URLs can make Meta reject the
    // QR image. The bill/reminder text is more important, so retry once as text.
    if (!provider.ok && hasImage) {
      imageError = providerError(provider.data);
      provider = await sendProviderRequest(endpoint, accessToken, textPayload);
      fallbackUsed = true;
    }

    if (!provider.ok) {
      return json({
        ok: false,
        error: providerError(provider.data),
        providerStatus: provider.status,
        details: provider.data,
        imageError,
      }, provider.status || 502);
    }

    const messages = provider.data.messages as Array<Record<string, unknown>> | undefined;
    return json({
      ok: true,
      messageId: messages?.[0]?.id ?? null,
      sentAs: hasImage && !fallbackUsed ? "image_with_caption" : "text",
      fallbackUsed,
      imageError,
      billNo: body.billNo ?? null,
      messageType: body.messageType ?? "manual",
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected WhatsApp send error" }, 500);
  }
});
