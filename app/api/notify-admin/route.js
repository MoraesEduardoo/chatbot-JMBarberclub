import { NextResponse } from "next/server";

/**
 * POST /api/notify-admin
 *   Body: { appointmentId: "uuid" }
 *
 * Ponte entre o chat do cliente e o painel do barbeiro. Repassa o id do
 * agendamento recém-criado para /api/push/appointment-created do painel
 * (projeto jm-barberclub-admin-v3), que dispara o push "Novo agendamento!"
 * no telemóvel do barbeiro e do chefe.
 */
export const runtime = "nodejs";

// Controle simples de Rate Limit em memória por IP (máx 15 requisições por minuto)
const rateLimitMap = new Map();
const LIMIT_WINDOW_MS = 60 * 1000; // 1 minuto
const MAX_REQUESTS_PER_WINDOW = 15;

function isRateLimited(ip) {
  const now = Date.now();
  const windowData = rateLimitMap.get(ip);

  if (!windowData) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }

  if (now - windowData.startTime > LIMIT_WINDOW_MS) {
    rateLimitMap.set(ip, { count: 1, startTime: now });
    return false;
  }

  windowData.count += 1;
  if (windowData.count > MAX_REQUESTS_PER_WINDOW) {
    return true;
  }

  return false;
}

function appointmentCreatedUrl(adminUrl) {
  const candidate = /^https?:\/\//i.test(adminUrl) ? adminUrl : `https://${adminUrl}`;
  const parsed = new URL(candidate);

  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("ADMIN_PANEL_URL precisa usar http:// ou https://.");
  }

  return new URL("/api/push/appointment-created", parsed.origin).toString();
}

export async function POST(request) {
  // Verificação de Rate Limit baseada no IP de origem
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";

  if (isRateLimited(clientIp)) {
    return NextResponse.json(
      { error: "Muitas requisições. Tente novamente mais tarde." },
      { status: 429 }
    );
  }

  const adminUrl = process.env.ADMIN_PANEL_URL;
  const secret = process.env.PUSH_WEBHOOK_SECRET;

  if (!adminUrl || !secret) {
    console.error(
      "[notify-admin] ADMIN_PANEL_URL e/ou PUSH_WEBHOOK_SECRET não configurados — push não enviado."
    );
    return NextResponse.json({ notified: false, reason: "não configurado" }, { status: 500 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const appointmentId = payload?.appointmentId;

  // Validação estrita de formato UUID para evitar payload malformado ou injection
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!appointmentId || !uuidRegex.test(appointmentId)) {
    return NextResponse.json(
      { error: 'O campo "appointmentId" é obrigatório e deve ser um UUID válido.' },
      { status: 400 }
    );
  }

  let endpoint;
  try {
    endpoint = appointmentCreatedUrl(adminUrl);
  } catch (error) {
    console.error("[notify-admin] ADMIN_PANEL_URL inválida:", error);
    return NextResponse.json({ notified: false, reason: "ADMIN_PANEL_URL inválida" }, { status: 503 });
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 8_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-push-secret": secret,
      },
      body: JSON.stringify({ appointmentId }),
      cache: "no-store",
      signal: controller.signal,
    });

    const result = await response.json().catch(() => ({}));

    if (!response.ok || result.error) {
      console.error("[notify-admin] Painel recusou o aviso:", response.status, result);
      return NextResponse.json({ notified: false, status: response.status, ...result });
    }

    return NextResponse.json({ notified: true, ...result });
  } catch (error) {
    console.error("[notify-admin] Falha ao avisar o painel:", error);
    return NextResponse.json({ notified: false, reason: error.message });
  } finally {
    clearTimeout(timeoutId);
  }
}