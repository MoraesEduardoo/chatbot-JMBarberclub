/**
 * Erros de integração com mensagem segura para o cliente.
 * O detalhe técnico vai para o console; a tela mostra só `message`.
 */
export class AppError extends Error {
  /** @param {"conflict"|"not_found"|"in_past"|"setup"|"network"|"unknown"} kind */
  constructor(kind, message, cause) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.cause = cause;
  }
}

const MESSAGES = {
  conflict: "Esse horário acabou de ser reservado. Escolha outro, por favor.",
  not_found: "Não encontrei esse agendamento — ele pode já ter sido alterado ou cancelado.",
  in_past: "Esse horário já passou. Escolha um horário futuro.",
  setup: "O sistema de agendamento ainda não foi configurado por completo. Avise a barbearia, por favor.",
  network: "Sem conexão com a internet. Verifique o sinal e tente de novo.",
  unknown: "Algo deu errado do nosso lado. Tente novamente em instantes.",
};

/** Qualquer erro (Supabase, fetch, Error) → AppError com `kind` estável. */
export function toAppError(error) {
  if (error instanceof AppError) return error;
  const code = error?.code;
  const text = String(error?.message ?? "");

  let kind = "unknown";
  if (typeof navigator !== "undefined" && navigator.onLine === false) kind = "network";
  else if (error?.name === "TypeError" && /fetch|network|load failed/i.test(text)) kind = "network";
  else if (code === "23505" || error?.status === 409 || /slot_taken/.test(text)) kind = "conflict";
  else if (code === "P0002" || /appointment_not_found/.test(text)) kind = "not_found";
  else if (/appointment_in_past/.test(text)) kind = "in_past";
  // PGRST202 / 42883: a função RPC não existe (migração não rodou) ou tem outra assinatura.
  else if (code === "PGRST202" || code === "42883") kind = "setup";

  if (kind === "unknown" || kind === "setup") console.error("[chat] erro de integração:", error);
  return new AppError(kind, MESSAGES[kind], error);
}
