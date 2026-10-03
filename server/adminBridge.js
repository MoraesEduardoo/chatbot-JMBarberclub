/** Ponte servidor→painel: o segredo PUSH_WEBHOOK_SECRET nunca chega ao navegador. */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isUuid = (value) => typeof value === "string" && UUID.test(value);

/** ADMIN_PANEL_URL (com ou sem esquema) → URL absoluta do endpoint do painel. */
export function appointmentCreatedUrl(adminUrl) {
  const candidate = /^https?:\/\//i.test(adminUrl) ? adminUrl : `https://${adminUrl}`;
  const parsed = new URL(candidate);
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("ADMIN_PANEL_URL precisa usar http:// ou https://.");
  }
  return new URL("/api/push/appointment-created", parsed.origin).toString();
}

/** @returns {Promise<{ok: boolean, status: number, body: object}>} */
export async function forwardAppointmentCreated({ adminUrl, secret, appointmentId, timeoutMs = 8_000 }) {
  const endpoint = appointmentCreatedUrl(adminUrl);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-push-secret": secret },
      body: JSON.stringify({ appointmentId }),
      cache: "no-store",
      signal: controller.signal,
    });
    const body = await response.json().catch(() => ({}));
    return { ok: response.ok && !body.error, status: response.status, body };
  } finally {
    clearTimeout(timeoutId);
  }
}
