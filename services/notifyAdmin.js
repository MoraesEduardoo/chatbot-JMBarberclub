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
    if (!response.ok || !result.notified) {
      console.error("[chat] Agendamento salvo, mas o painel não confirmou o aviso:", { status: response.status, result });
    }
  } catch (error) {
    console.error("[chat] Agendamento salvo, mas o aviso ao painel falhou:", error);
  } finally {
    clearTimeout(timeoutId);
  }
}
