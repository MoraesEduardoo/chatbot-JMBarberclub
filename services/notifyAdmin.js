/**
 * Avisa o painel do barbeiro (push "Novo agendamento!") via /api/notify-admin.
 * Roda DEPOIS de o agendamento estar gravado e NUNCA derruba nem atrasa o fluxo:
 * quem chama não precisa dar `await`. Se o painel estiver fora do ar, a reserva
 * continua na agenda (Realtime + recarga da tela do painel).
 */
export async function notifyAdminPanel(appointmentId) {
  if (!appointmentId) return;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("/api/notify-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true, // conclui a chamada mesmo se a tela trocar logo em seguida
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ appointmentId }),
    });
    const result = await response.json().catch(() => ({}));
    if (result?.skipped || result?.reason === "webhook_not_configured" || result?.reason === "não configurado") {
      // Notificação push externa é opcional e não configurada — agendamento já está 100% gravado no banco
      return;
    }
    if (!response.ok || !result.notified) {
      console.warn("[chat] Aviso opcional ao painel não confirmado:", { status: response.status, result });
    }
  } catch (error) {
    console.warn("[chat] Aviso opcional ao painel falhou:", error);
  } finally {
    clearTimeout(timeoutId);
  }
}
