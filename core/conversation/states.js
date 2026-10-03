/** Estados possíveis da conversa. Cada estado tem UMA responsabilidade. */
export const S = Object.freeze({
  BOOT: "BOOT", // antes de carregar perfil/catálogo
  MENU: "MENU", // menu principal
  ASK_NAME: "ASK_NAME",
  ASK_PHONE: "ASK_PHONE",
  CHOOSE_SERVICES: "CHOOSE_SERVICES",
  CHOOSE_BARBER: "CHOOSE_BARBER",
  CHOOSE_DATE: "CHOOSE_DATE",
  CHOOSE_TIME: "CHOOSE_TIME",
  CONFIRM: "CONFIRM", // resumo do agendamento / remarcação
  WORKING: "WORKING", // gravando no banco (ignora novas entradas: evita clique duplo)
  DONE: "DONE", // resultado (confirmado, remarcado ou cancelado)
  LIST_APPOINTMENTS: "LIST_APPOINTMENTS",
  CONFIRM_CANCEL: "CONFIRM_CANCEL",
});

/**
 * Escopo do estado, usado para interpretar comandos livres:
 * - strict: esperamos um dado (nome/telefone) → só comandos EXATOS ("menu", "voltar")
 * - flow:   meio de um fluxo → o significado do estado vem primeiro, depois os comandos globais
 * - idle:   menu/listas/resultado → qualquer intenção global é bem-vinda
 */
export function scopeOf(state) {
  switch (state) {
    case S.ASK_NAME:
    case S.ASK_PHONE:
      return "strict";
    case S.CHOOSE_SERVICES:
    case S.CHOOSE_BARBER:
    case S.CHOOSE_DATE:
    case S.CHOOSE_TIME:
    case S.CONFIRM:
    case S.CONFIRM_CANCEL:
      return "flow";
    default:
      return "idle";
  }
}

/** Widgets que só aparecem na ÚLTIMA mensagem em que foram emitidos (os demais são estáticos). */
export const INTERACTIVE_WIDGETS = new Set(["services", "barbers", "dates", "times", "summary", "appointments"]);
