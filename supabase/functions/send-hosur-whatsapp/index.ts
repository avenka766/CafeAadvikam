import "jsr:@supabase/functions-js/edge-runtime.d.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cafe-session, x-client-app",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Max-Age": "86400",
};

type MediaInput = {
  base64?: string;
  mimeType?: string;
  fileName?: string;
  caption?: string;
};

type RequestBody = {
  phone?: string;
  message?: string;
  shopId?: string | null;
  billId?: string | null;
  billNo?: string | null;
  messageType?: "bill" | "reminder" | "manual";
  billDocument?: MediaInput | null;
  qrImage?: MediaInput | null;
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

function decodeBase64(value: string) {
  const binary = atob(value.replace(/^data:[^,]+,/, ""));
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return bytes;
}

async function providerJson(response: Response): Promise<Record<string, unknown>> {
  try {
    return await response.json();
  } catch {
    return { error: { message: `WhatsApp provider returned HTTP ${response.status}.` } };
  }
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
  return { ok: response.ok, status: response.status, data: await providerJson(response) };
}

async function uploadMedia(
  apiVersion: string,
  phoneNumberId: string,
  accessToken: string,
  media: MediaInput,
  allowedMimeTypes: string[],
) {
  const mimeType = String(media.mimeType ?? "");
  const fileName = String(media.fileName ?? "whatsapp-media");
  const base64 = String(media.base64 ?? "");
  if (!base64) throw new Error(`${fileName}: media content is missing.`);
  if (!allowedMimeTypes.includes(mimeType)) throw new Error(`${fileName}: unsupported media type ${mimeType || "unknown"}.`);

  const bytes = decodeBase64(base64);
  const maxBytes = mimeType === "application/pdf" ? 100 * 1024 * 1024 : 5 * 1024 * 1024;
  if (bytes.byteLength > maxBytes) throw new Error(`${fileName}: media file is too large.`);

  const form = new FormData();
  form.append("messaging_product", "whatsapp");
  form.append("type", mimeType);
  form.append("file", new Blob([bytes], { type: mimeType }), fileName);

  const response = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/media`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}` },
    body: form,
  });
  const data = await providerJson(response);
  if (!response.ok || !data.id) throw new Error(`${fileName}: ${providerError(data)}`);
  return String(data.id);
}

async function sendMediaMessage(
  endpoint: string,
  accessToken: string,
  phone: string,
  kind: "document" | "image",
  mediaId: string,
  media: MediaInput,
) {
  const body = kind === "document"
    ? {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "document",
        document: {
          id: mediaId,
          filename: String(media.fileName ?? "Hosur-Bill.pdf").slice(0, 240),
          caption: String(media.caption ?? "").slice(0, 1024),
        },
      }
    : {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: phone,
        type: "image",
        image: {
          id: mediaId,
          caption: String(media.caption ?? "").slice(0, 1024),
        },
      };
  const result = await sendProviderRequest(endpoint, accessToken, body);
  if (!result.ok) throw new Error(providerError(result.data));
  const messages = result.data.messages as Array<Record<string, unknown>> | undefined;
  return String(messages?.[0]?.id ?? "");
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "Method not allowed" }, 405);

  try {
    const body = (await req.json()) as RequestBody;
    const phone = normalizeIndianPhone(body.phone ?? "");
    const message = (body.message ?? "").trim();
    const messageType = body.messageType ?? "manual";

    if (!/^91\d{10}$/.test(phone)) return json({ ok: false, error: "Enter a valid 10-digit Indian WhatsApp number." }, 400);
    if (!message) return json({ ok: false, error: "Message text is required." }, 400);
    if (messageType === "bill" && !body.billDocument?.base64) {
      return json({ ok: false, error: "Bill PDF was not supplied to the WhatsApp service." }, 400);
    }
    if ((messageType === "bill" || messageType === "reminder") && !body.qrImage?.base64) {
      return json({ ok: false, error: "Payment QR image was not supplied to the WhatsApp service." }, 400);
    }

    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION") ?? "v22.0";
    if (!accessToken || !phoneNumberId) {
      return json({ ok: false, error: "WhatsApp Cloud API secrets are missing." }, 500);
    }

    const endpoint = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const mediaMessageIds: string[] = [];
    const mediaErrors: string[] = [];

    // Upload the binary files directly to Meta and send them by media ID. This
    // avoids public-link fetch failures and guarantees the actual PDF/PNG bytes
    // are available to WhatsApp.
    if (body.billDocument?.base64) {
      try {
        const mediaId = await uploadMedia(apiVersion, phoneNumberId, accessToken, body.billDocument, ["application/pdf"]);
        mediaMessageIds.push(await sendMediaMessage(endpoint, accessToken, phone, "document", mediaId, body.billDocument));
      } catch (error) {
        mediaErrors.push(error instanceof Error ? error.message : "Bill PDF send failed.");
      }
    }

    if (body.qrImage?.base64) {
      try {
        const mediaId = await uploadMedia(apiVersion, phoneNumberId, accessToken, body.qrImage, ["image/png", "image/jpeg"]);
        mediaMessageIds.push(await sendMediaMessage(endpoint, accessToken, phone, "image", mediaId, body.qrImage));
      } catch (error) {
        mediaErrors.push(error instanceof Error ? error.message : "QR image send failed.");
      }
    }

    if (mediaErrors.length > 0) {
      return json({ ok: false, error: "WhatsApp media delivery failed.", mediaErrors, mediaMessageIds }, 502);
    }

    const textResult = await sendProviderRequest(endpoint, accessToken, {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to: phone,
      type: "text",
      text: { preview_url: false, body: message.slice(0, 4096) },
    });
    if (!textResult.ok) {
      return json({ ok: false, error: providerError(textResult.data), details: textResult.data, mediaMessageIds }, textResult.status || 502);
    }

    const textMessages = textResult.data.messages as Array<Record<string, unknown>> | undefined;
    return json({
      ok: true,
      messageId: textMessages?.[0]?.id ?? null,
      mediaMessageIds,
      sentParts: {
        billDocument: Boolean(body.billDocument?.base64),
        qrImage: Boolean(body.qrImage?.base64),
        text: true,
      },
      billNo: body.billNo ?? null,
      messageType,
    });
  } catch (error) {
    return json({ ok: false, error: error instanceof Error ? error.message : "Unexpected WhatsApp send error" }, 500);
  }
});
