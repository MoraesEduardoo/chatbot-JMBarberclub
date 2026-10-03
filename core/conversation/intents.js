/**
 * Intenções GLOBAIS: comandos que valem em (quase) qualquer ponto da conversa.
 * Devolve uma "ação" semântica — o mesmo objeto que um clique em botão geraria.
 * A máquina de estados não sabe se veio de texto ou de toque.
 */
import { normalize } from "./parsers.js";

const MENU_EXACT = /^(menu|menu principal|inicio|home|comecar|recomecar|reiniciar|voltar (?:ao|para o|pro) (?:menu|inicio)|ir para o menu)$/;
const BACK_EXACT = /^(voltar|volta|anterior|retornar|desfazer|errei|passo anterior|etapa anterior)$/;
const ABORT_EXACT = /^(cancelar|cancela|desistir|desisto|sair|parar|para|deixa pra la|esquece|deixa quieto|nao quero mais)(?: tudo| isso)?$/;
const HELP_EXACT = /^(ajuda|socorro|help)$/;

const RESET_ID = /\b(trocar|mudar|alterar|corrigir|atualizar)\b.*\b(nome|telefone|numero|whatsapp|meus dados)\b/;
const RESCHEDULE_STRONG = /\b(remarc\w*|reagend\w*|adiar|antecipar)\b/;
const RESCHEDULE_SOFT = /\b(mudar|trocar|alterar|passar)\b.*\b(horario|dia|data|agendamento|corte)\b.*\b(marcado|agendado|meu|minha)\b|\b(mudar|trocar|alterar) (?:o |a |meu |minha )?(?:agendamento|corte marcado)\b/;
const CANCEL_WORD = /\b(cancel\w*|desmarc\w*)\b/;
const POSSESSIVE = /\b(meu|minha|marcado|marcada|agendado|agendada|reserva)\b/;
const VIEW_APPTS = /\b(meus? (?:agendamentos?|horarios?|cortes?|marcac\w+|reservas?)|minhas? (?:marcac\w+|reservas?)|ver (?:meu|minha|meus|minhas)? ?(?:agend\w*|horario\w*)|consultar|tenho (?:algum )?(?:horario|agendamento|corte)|quando (?:e|eh) (?:o )?(?:meu )?(?:corte|horario|agendamento)|agendamentos? (?:ativos?|marcados?))\b/;
const HOURS = /\b(funcionamento|que horas (?:voces |a barbearia |a loja )?(?:abr\w*|fech\w*|funcion\w*|atend\w*)|(?:abre|abrem|fecha|fecham|funciona|funcionam) (?:hoje|amanha|domingo|sabado|segunda|terca|quarta|quinta|sexta|aos|que horas)|esta aberto|estao abertos|horario de atendimento|atendem (?:hoje|domingo|sabado|aos))\b/;
const CATALOG = /\b(servicos?|precos?|valores?|tabela|catalogo|cardapio|quanto (?:custa|cobra|e|fica|sai)|o que (?:voces )?(?:fazem|tem|oferecem))\b/;
const START = /\b(agendar|marcar|reservar|quero (?:um |uma )?(?:corte|horario|agendamento|cortar)|novo agendamento|fazer (?:um |o )?agendamento|cortar (?:o )?cabelo|fazer (?:a )?barba)\b/;
const HELP = /\b(ajuda|ajudar|atendente|humano|falar com (?:alguem|o barbeiro|a barbearia|uma pessoa)|whatsapp|zap|contato)\b/;
const GREETING = /^(oi|ola|opa|eai|e ai|hey|hello|bom dia|boa tarde|boa noite|salve|fala)\b/;
const THANKS = /^(obrigad[oa]|valeu|vlw|agradeco|show|top|tmj)\b/;

/**
 * @param {string} text
 * @param {{scope?: "strict"|"flow"|"idle"}} [options] ver scopeOf() em states.js
 * @returns {object|null} ação global ou null
 */
export function detectGlobalIntent(text, { scope = "idle" } = {}) {
  const t = normalize(text);
  if (!t) return null;

  if (MENU_EXACT.test(t)) return { type: "GO_MENU" };
  if (BACK_EXACT.test(t)) return { type: "GO_BACK" };
  if (scope !== "idle" && ABORT_EXACT.test(t)) return { type: "GO_MENU" }; // "cancelar" no meio do fluxo = desistir

  // Esperando nome/telefone: qualquer outra coisa pode ser o dado — só comandos exatos.
  if (scope === "strict") return HELP_EXACT.test(t) ? { type: "HELP" } : null;

  if (RESET_ID.test(t)) return { type: "RESET_IDENTITY" };
  if (RESCHEDULE_STRONG.test(t) || (scope === "idle" && RESCHEDULE_SOFT.test(t))) return { type: "VIEW_APPOINTMENTS", mode: "reschedule" };
  if (CANCEL_WORD.test(t)) {
    // "cancelar meu agendamento" (ou qualquer "cancelar" fora de fluxo) → lista para cancelar
    return scope === "idle" || POSSESSIVE.test(t) ? { type: "VIEW_APPOINTMENTS", mode: "cancel" } : { type: "GO_MENU" };
  }
  if (VIEW_APPTS.test(t)) return { type: "VIEW_APPOINTMENTS", mode: "view" };
  if (HOURS.test(t)) return { type: "VIEW_HOURS" };
  if (CATALOG.test(t)) return { type: "VIEW_CATALOG" };
  if (START.test(t)) return scope === "idle" ? { type: "START_BOOKING" } : { type: "REPROMPT" };
  if (HELP.test(t)) return { type: "HELP" };
  if (GREETING.test(t)) return scope === "idle" ? { type: "GREETING" } : { type: "REPROMPT" };
  if (THANKS.test(t)) return { type: "THANKS" };
  return null;
}
