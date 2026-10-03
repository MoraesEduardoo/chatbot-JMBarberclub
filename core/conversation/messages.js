/**
 * Textos do bot (pt-BR) — todo o "tom de voz" fica aqui.
 * **negrito** e quebras de linha são renderizados pela UI (RichText).
 */
import { BUSINESS_HOURS, SHOP } from "../domain/config.js";
import { S } from "./states.js";
import { normalizePhone } from "../domain/phone.js";

const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0];
const WEEK_NAMES = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

export const hoursRows = () =>
  WEEK_ORDER.map((day) => ({
    label: WEEK_NAMES[day],
    hours: BUSINESS_HOURS[day] ? `${BUSINESS_HOURS[day].start} às ${BUSINESS_HOURS[day].end}` : "Fechado",
  }));

export function contactLine() {
  const digits = normalizePhone(SHOP.whatsapp);
  return digits
    ? `Se preferir, fale com a gente no WhatsApp: https://wa.me/55${digits}`
    : "Se preferir, fale diretamente com a barbearia.";
}

const DATE_ERRORS = {
  past: "Essa data já passou. Escolha hoje ou um dia futuro.",
  too_far: "Só consigo agendar com até 6 meses de antecedência. Escolha uma data mais próxima.",
  closed: "Não abrimos nesse dia. Escolha outra data.",
  invalid: "Não consegui entender essa data. Tente algo como \"amanhã\", \"sexta\" ou \"15/10\".",
};

export const T = {
  welcomeNew: "Olá! 👋 Bem-vindo ao **JM Barberclub**. Como posso ajudar?",
  welcomeBack: (name) => `Olá, **${name}**! Bem-vindo de volta 👋 Como posso ajudar?`,
  menuAgain: "Como posso ajudar agora?",
  menuHint: "Você pode tocar em uma opção ou escrever, por exemplo: \"quero agendar\", \"meus agendamentos\" ou \"preços\".",

  askName: "Como podemos te chamar?",
  askPhone: (name) => (name ? `Prazer, **${name}**! Qual é o seu WhatsApp com DDD?` : "Qual é o seu WhatsApp com DDD?"),
  askPhoneLookup: "Qual é o WhatsApp que você usou no agendamento? (com DDD)",
  invalidPhone: "Esse número não parece válido. Digite com DDD, por exemplo: (83) 99999-9999.",
  identityReset: "Tudo bem, vamos atualizar seus dados.",
  identityDone: "Pronto, dados atualizados! ✅",

  loadingCatalog: "Carregando os serviços…",
  catalogError: "Não consegui carregar os serviços agora. Verifique sua conexão e tente novamente.",
  noServices: "Nenhum serviço disponível no momento. Fale com a barbearia, por favor.",
  askServices: "Quais serviços você deseja? Pode marcar mais de um — toque nos cartões ou escreva os nomes (ex.: \"degradê e sobrancelha\").",
  servicesAdded: (names, total) => `Anotado: **${names}** — total **${total}**.\nQuer mais algum? Se não, toque em **Continuar**.`,
  askWhichService: (query) => `"${query}" pode ser mais de um serviço. Qual deles?`,
  unknownService: (query) => `Não encontrei nenhum serviço parecido com "${query}". Toque nos cartões para escolher.`,
  needService: "Escolha pelo menos um serviço para continuar.",

  askBarber: "Com qual barbeiro você prefere agendar?",
  singleBarber: (name) => `Só o **${name}** realiza esses serviços — já deixei selecionado.`,
  noBarber: "Nenhum barbeiro realiza essa combinação de serviços. Volte e ajuste os serviços, ou faça dois agendamentos separados.",
  barberCannot: (barber, services) => `**${barber}** não realiza: ${services}. Escolha outro profissional.`,

  askDate: "Para qual dia? Toque em uma data ou escreva (\"amanhã\", \"sexta\", \"15/10\").",
  askDateReschedule: (services, barber, whenText) =>
    `Vamos remarcar **${services}** com **${barber}** (hoje: ${whenText}).\nPara qual dia você quer mudar?`,
  dateError: (reason) => DATE_ERRORS[reason] ?? DATE_ERRORS.invalid,
  timesHeader: (dateText, barber) => `Horários de **${dateText}** com **${barber}**:`,
  stillLoading: "Só um instante, ainda estou consultando a disponibilidade…",
  availabilityError: "Não consegui consultar os horários agora. Tente novamente em instantes.",
  dayOver: "Hoje não há mais horários disponíveis. Escolha outro dia.",
  dayFull: "Esse dia está lotado. Que tal outro dia?",
  timeBooked: (time) => `As **${time}** já está ocupado.`,
  timePast: (time) => `As **${time}** já passou.`,
  timeOverflow: (time) => `As **${time}** não comporta a duração dos serviços escolhidos antes de fecharmos.`,
  timeOffGrid: "Atendemos em intervalos de 30 minutos.",
  suggestTimes: (times) => `Livres perto disso: ${times.map((t) => `**${t}**`).join(", ")}.`,
  sameAsCurrent: "Esse já é o horário do seu agendamento. Escolha outro.",

  confirmBook: "Confira seu agendamento. Posso confirmar?",
  confirmReschedule: "Confira a remarcação. Posso confirmar?",
  askWhatToChange: "Sem problemas! O que você quer alterar?",
  cannotChangeInReschedule: "Na remarcação só dá para mudar o dia e o horário. Para trocar serviço ou barbeiro, cancele e faça um novo agendamento.",

  booked: "**Agendamento confirmado!** ✅\nTe esperamos aí. Se precisar mudar, é só pedir para remarcar ou cancelar.",
  rescheduled: "**Remarcado com sucesso!** ✅",
  cancelled: "Agendamento **cancelado**. Quando quiser marcar outro, é só chamar.",
  slotTaken: "Poxa, esse horário acabou de ser reservado por outra pessoa. Vou atualizar os horários disponíveis.",
  incomplete: "Faltou alguma informação. Vamos retomar de onde parou.",
  working: "Só um instante, estou finalizando… ⏳",

  searching: "Vou buscar seus agendamentos ativos… 🔎",
  noAppointments: "Você não tem agendamentos ativos no momento.",
  appointmentsFound: (n, intent) => {
    const which = n === 1 ? "1 agendamento ativo" : `${n} agendamentos ativos`;
    if (intent === "cancel") return `Encontrei ${which}. Qual deseja **cancelar**?`;
    if (intent === "reschedule") return `Encontrei ${which}. Qual deseja **remarcar**?`;
    return `Encontrei ${which}:`;
  },
  appointmentsError: "Não consegui buscar seus agendamentos agora. Tente novamente.",
  pickOneAppointment: "Toque em **Remarcar** ou **Cancelar** no agendamento desejado.",
  confirmCancel: (services, barber, whenText) => `Quer mesmo cancelar **${services}** com **${barber}** — ${whenText}?`,
  keptAppointment: "Certo, mantive o seu agendamento. 👍",

  priceListIntro: "Nossos serviços e valores:",
  hoursIntro: "Nosso horário de funcionamento:",
  help: () => `Estou aqui para agendar, consultar, remarcar ou cancelar horários.\n${contactLine()}`,
  thanks: "Por nada! 😊",
  alreadyMenu: "Você já está no menu principal.",
  needIdentityFirst: "Antes, preciso confirmar seus dados.",
  wait: "Só um instante, estou finalizando… ⏳",

  fallback1: (hint) => `Não entendi 😅\n${hint}`,
  fallback2: (hint) => `Ainda não consegui entender.\n${hint}\nSe quiser recomeçar, digite **menu**.`,
  fallback3: (hint) => `Parece que estou com dificuldade para te entender.\n${hint}\n${contactLine()}\nOu digite **menu** para recomeçar.`,
};

export const HINTS = {
  [S.MENU]: T.menuHint,
  [S.ASK_NAME]: "Me diga só o seu nome, por favor.",
  [S.ASK_PHONE]: "Preciso do seu WhatsApp com DDD, por exemplo (83) 99999-9999.",
  [S.CHOOSE_SERVICES]: "Toque nos serviços ou escreva o nome (\"degradê e sobrancelha\"). Quando terminar, toque em **Continuar**.",
  [S.CHOOSE_BARBER]: "Toque em um barbeiro ou escreva o nome. Sem preferência? Diga \"tanto faz\".",
  [S.CHOOSE_DATE]: "Escolha uma data ou escreva, por exemplo, \"amanhã\", \"sexta\" ou \"15/10\".",
  [S.CHOOSE_TIME]: "Toque em um horário livre ou escreva, por exemplo, \"14:30\".",
  [S.CONFIRM]: "Responda **sim** para confirmar, ou diga o que quer trocar (serviço, barbeiro, dia ou horário).",
  [S.LIST_APPOINTMENTS]: T.pickOneAppointment,
  [S.CONFIRM_CANCEL]: "Responda **sim** para cancelar ou **não** para manter o agendamento.",
  [S.DONE]: "Toque em uma das opções abaixo ou digite **menu**.",
  [S.WORKING]: T.working,
  [S.BOOT]: T.menuHint,
};
