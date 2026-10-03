import { NextResponse } from "next/server";
import { createRateLimiter } from "@/server/rateLimit";
import { forwardAppointmentCreated, isUuid } from "@/server/adminBridge";

/**
 * POST /api/notify-admin   Body: { appointmentId: "uuid" }
 * Repassa o id do agendamento recém-criado ao painel do barbeiro, que dispara o push
 * "Novo agendamento!". Ver README → "Integração com o painel".
 */
export const runtime = "nodejs";

const isLimited = createRateLimiter({ windowMs: 60_000, max: 15 });

export async function POST(request) {
  const forwardedFor = request.headers.get("x-forwarded-for");
  const clientIp = forwardedFor ? forwardedFor.split(",")[0].trim() : "unknown";
  if (isLimited(clientIp)) {
    return NextResponse.json({ error: "Muitas requisições. Tente novamente mais tarde." }, { status: 429 });
  }

  const adminUrl = process.env.ADMIN_PANEL_URL;
  const secret = process.env.PUSH_WEBHOOK_SECRET;
  if (!adminUrl || !secret) {
    console.error("[notify-admin] ADMIN_PANEL_URL e/ou PUSH_WEBHOOK_SECRET não configurados — push não enviado.");
    return NextResponse.json({ notified: false, reason: "não configurado" }, { status: 500 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const appointmentId = payload?.appointmentId;
  if (!isUuid(appointmentId)) {
    return NextResponse.json({ error: 'O campo "appointmentId" é obrigatório e deve ser um UUID válido.' }, { status: 400 });
  }

  try {
    const { ok, status, body } = await forwardAppointmentCreated({ adminUrl, secret, appointmentId });
    if (!ok) {
      console.error("[notify-admin] Painel recusou o aviso:", status, body);
      return NextResponse.json({ notified: false, status, ...body });
    }
    return NextResponse.json({ notified: true, ...body });
  } catch (error) {
    console.error("[notify-admin] Falha ao avisar o painel:", error);
    return NextResponse.json({ notified: false, reason: "falha ao contactar o painel" });
  }
}
