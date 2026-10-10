/**
 * MÁQUINA DE ESTADOS DA CONVERSA
 * ============================================================================
 * `reduce(ctx, action) → { ctx, effects }` é uma função PURA:
 *   - não toca em React, Supabase, localStorage nem relógio (o "agora" vem em `action.now`);
 *   - não faz I/O: pede o que precisa devolvendo `effects` (ex.: LOAD_AVAILABILITY);
 *   - quem executa os efeitos (hooks/useChatbot.js) devolve o resultado como uma nova
 *     action (AVAILABILITY_LOADED, SAVE_OK, SAVE_FAILED …).
 *
 * Por que isso deixa o bot "à prova de se perder":
 *   1. TUDO é uma action — texto digitado e toque em botão passam pelo mesmo funil.
 *   2. Cada action é validada contra o estado atual. Clique em um card antigo ou resposta
 *      de rede atrasada é ignorada (nunca corrompe o fluxo).
 *   3. Comandos globais (menu, voltar, meus agendamentos, preços…) valem em qualquer estado.
 *   4. Texto não entendido → fallback progressivo (dica → dica + opções → contato humano).
 *   5. Enquanto grava (WORKING) novas entradas são barradas: sem agendamento duplicado.
 *
 * Mapa de estados (resumo):
 *   BOOT → MENU
 *   MENU → [ASK_NAME → ASK_PHONE] → CHOOSE_SERVICES → CHOOSE_BARBER → CHOOSE_DATE
 *        → CHOOSE_TIME → CONFIRM → WORKING → DONE
 *   MENU → [ASK_PHONE] → LIST_APPOINTMENTS → CONFIRM_CANCEL → WORKING → DONE
 *                                          → CHOOSE_DATE (reagendar) → … → CONFIRM → WORKING → DONE
 */
import { S, scopeOf, INTERACTIVE_WIDGETS } from "./states.js";
import { T, HINTS, hoursRows } from "./messages.js";
import { detectGlobalIntent } from "./intents.js";
import {
  isContinue, isNo, isYes, matchBarber, matchServices, parseChangeField,
  parseDate, parseIndexList, parseName, parseTime,
} from "./parsers.js";
import { isValidPhone, normalizePhone } from "../domain/phone.js";
import { checkDate } from "../domain/availability.js";
import { getEligibleBarbers, getTotalPrice } from "../domain/eligibility.js";
import { formatDateLong, formatPrice, timeToMinutes } from "../domain/time.js";
import { selectSlots, selectSummary } from "./selectors.js";

/* ============================ contexto inicial ============================ */

const emptyDraft = () => ({ services: [], barber: null, dateKey: null, time: null });

export function createInitialContext(now = Date.now()) {
  return {
    state: S.BOOT,
    now,
    seq: 0,
    mode: "book", // "book" | "reschedule"
    client: { name: "", phone: "" },
    catalog: { status: "loading", services: [], barbers: [], links: [] }, // status: loading | ready | error
    draft: emptyDraft(),
    availability: { status: "idle", key: null, booked: [] }, // idle | loading | ready | error
    appointments: { status: "idle", groups: [], intent: "view" },
    target: null, // reserva sendo remarcada/cancelada
    afterIdentity: null, // ação a retomar depois de coletar nome/telefone
    pendingTime: null, // "sexta às 14h": guarda o 14:00 até os horários carregarem
    fails: 0, // quantas vezes seguidas o bot não entendeu
    suggest: [], // chips extras (candidatos ambíguos, horários próximos)
    messages: [],
    activeWidgetId: null, // só o widget interativo da última mensagem fica "vivo"
  };
}

/* ============================== helpers de UI ============================== */

const push = (c, message) => {
  c.seq += 1;
  c.messages.push({ id: c.seq, ...message });
  return c.seq;
};

/** Mensagem do bot, opcionalmente com widget. Widgets interativos tomam o foco (activeWidgetId). */
const say = (c, text, widget = null) => {
  const id = push(c, { from: "bot", text, widget });
  if (widget && INTERACTIVE_WIDGETS.has(widget.type)) c.activeWidgetId = id;
  return id;
};
const emitWidget = (c, type) => say(c, null, { type });

const WIDGET_BY_STATE = {
  [S.CHOOSE_SERVICES]: "services",
  [S.CHOOSE_BARBER]: "barbers",
  [S.CHOOSE_DATE]: "dates",
  [S.CHOOSE_TIME]: "times",
  [S.CONFIRM]: "summary",
};

function emitWidgetFor(c) {
  const type = WIDGET_BY_STATE[c.state];
  if (type === "services" && c.catalog.status !== "ready") return;
  if (type) return emitWidget(c, type);
  if (c.state === S.LIST_APPOINTMENTS && c.appointments.groups.length) return emitWidget(c, "appointments");
  return undefined;
}

/** Repete a pergunta do passo atual (dica + opções de novo, no fim da conversa). */
function reprompt(c) {
  const hint = HINTS[c.state];
  if (hint) say(c, hint);
  emitWidgetFor(c);
}

const FLOW_STATES = new Set([
  S.CHOOSE_SERVICES, S.CHOOSE_BARBER, S.CHOOSE_DATE, S.CHOOSE_TIME, S.CONFIRM, S.CONFIRM_CANCEL, S.ASK_NAME, S.ASK_PHONE,
]);
/** Depois de uma resposta informativa (preços, horários, ajuda) no meio de um fluxo, retoma o passo. */
const afterInfo = (c) => { if (FLOW_STATES.has(c.state)) reprompt(c); };

const whenText = (g) => `${formatDateLong(g.dateKey)} às ${g.time}`;

/* ============================ transições básicas =========================== */

function resetFlow(c) {
  c.draft = emptyDraft();
  c.mode = "book";
  c.target = null;
  c.availability = { status: "idle", key: null, booked: [] };
  c.pendingTime = null;
  c.afterIdentity = null;
  c.activeWidgetId = null;
}

function enterMenu(c, { text } = {}) {
  resetFlow(c);
  c.state = S.MENU;
  say(c, text ?? T.menuAgain);
}

const askName = (c) => { c.state = S.ASK_NAME; say(c, T.askName); };
const askPhone = (c) => {
  c.state = S.ASK_PHONE;
  say(c, c.afterIdentity?.type === "VIEW_APPOINTMENTS" ? T.askPhoneLookup : T.askPhone(c.client.name));
};

function enterServices(c) {
  c.state = S.CHOOSE_SERVICES;
  if (c.catalog.status === "loading") return say(c, T.loadingCatalog);
  if (c.catalog.status === "error") return say(c, T.catalogError);
  if (!c.catalog.services.length) {
    say(c, T.noServices);
    c.state = S.MENU;
    return undefined;
  }
  return say(c, T.askServices, { type: "services" });
}

function enterBarber(c, fx) {
  const eligible = getEligibleBarbers(c.catalog, c.draft.services);
  if (eligible.length === 0) {
    say(c, T.noBarber);
    return enterServices(c);
  }
  if (eligible.length === 1) {
    c.draft.barber = eligible[0];
    say(c, T.singleBarber(eligible[0].name));
    return enterDate(c);
  }
  c.state = S.CHOOSE_BARBER;
  return say(c, T.askBarber, { type: "barbers" });
}

function enterDate(c) {
  c.state = S.CHOOSE_DATE;
  c.availability = { status: "idle", key: null, booked: [] };
  const text =
    c.mode === "reschedule" && c.target
      ? T.askDateReschedule(c.draft.services.map((s) => s.name).join(" + "), c.draft.barber.name, whenText(c.target))
      : T.askDate;
  return say(c, text, { type: "dates" });
}

/** Entra em CHOOSE_TIME e pede os horários ocupados ao banco. A chave descarta respostas atrasadas. */
function startAvailability(c, fx) {
  const { barber, dateKey } = c.draft;
  const key = `${barber.id}|${dateKey}`;
  c.state = S.CHOOSE_TIME;
  c.availability = { status: "loading", key, booked: [] };
  say(c, T.timesHeader(formatDateLong(dateKey), barber.name), { type: "times" });
  fx.push({ type: "LOAD_AVAILABILITY", key, barberId: barber.id, dateKey });
}

function reloadTimes(c, fx) {
  if (!c.draft.dateKey) return enterDate(c);
  return startAvailability(c, fx);
}

function enterConfirm(c) {
  c.state = S.CONFIRM;
  say(c, c.mode === "reschedule" ? T.confirmReschedule : T.confirmBook, { type: "summary" });
}

/** Retoma o próximo passo que ainda falta (usado quando algo ficou inconsistente). */
function resume(c, fx) {
  const d = c.draft;
  if (!d.services.length) return enterServices(c);
  if (!d.barber) return enterBarber(c, fx);
  if (!d.dateKey) return enterDate(c);
  if (!d.time) return reloadTimes(c, fx);
  return enterConfirm(c);
}

/* ================================ identidade =============================== */

function finishIdentity(c, fx) {
  const next = c.afterIdentity;
  c.afterIdentity = null;
  if (!next) return enterMenu(c);
  return handle(c, fx, next);
}

/* ================================== reservas =============================== */

function startBooking(c, fx) {
  resetFlow(c);
  if (!c.client.name) { c.afterIdentity = { type: "START_BOOKING" }; return askName(c); }
  if (!c.client.phone) { c.afterIdentity = { type: "START_BOOKING" }; return askPhone(c); }
  return enterServices(c);
}

function setServices(c, services) {
  c.draft.services = services;
  c.draft.barber = null; // mudar serviço invalida barbeiro, data e horário
  c.draft.dateKey = null;
  c.draft.time = null;
}

function toggleService(c, id) {
  const service = c.catalog.services.find((s) => s.id === id);
  if (!service) return;
  const has = c.draft.services.some((s) => s.id === id);
  setServices(c, has ? c.draft.services.filter((s) => s.id !== id) : [...c.draft.services, service]);
}

function confirmServices(c, fx) {
  if (!c.draft.services.length) return say(c, T.needService);
  return enterBarber(c, fx);
}

function pickBarber(c, id) {
  const eligible = getEligibleBarbers(c.catalog, c.draft.services);
  const barber = id === "any" ? eligible[0] : c.catalog.barbers.find((b) => b.id === id);
  if (!barber) return false;
  if (!eligible.some((b) => b.id === barber.id)) {
    const cannot = c.draft.services
      .filter((s) => !getEligibleBarbers(c.catalog, [s]).some((b) => b.id === barber.id))
      .map((s) => s.name)
      .join(", ");
    say(c, T.barberCannot(barber.name, cannot));
    return true;
  }
  c.draft.barber = barber;
  c.draft.dateKey = null;
  c.draft.time = null;
  enterDate(c);
  return true;
}

function pickDate(c, fx, dateKey, pendingTime = null) {
  const barberSchedule = c.draft.barber?.schedules ?? c.draft.barber?.schedule ?? null;
  const reason = checkDate(dateKey, c.now, barberSchedule);
  if (reason) return say(c, T.dateError(reason));
  c.draft.dateKey = dateKey;
  c.draft.time = null;
  c.pendingTime = pendingTime;
  return startAvailability(c, fx);
}

const nearestFree = (slots, time, limit = 3) => {
  const target = timeToMinutes(time);
  return slots
    .filter((s) => s.available)
    .sort((a, b) => Math.abs(timeToMinutes(a.time) - target) - Math.abs(timeToMinutes(b.time) - target))
    .slice(0, limit)
    .map((s) => s.time)
    .sort();
};

function pickTime(c, time) {
  if (c.availability.status !== "ready") return say(c, T.stillLoading);
  const slots = selectSlots(c);
  const slot = slots.find((s) => s.time === time);
  const suggestTimes = () => {
    const near = nearestFree(slots, time);
    if (near.length) {
      say(c, T.suggestTimes(near));
      c.suggest = near.map((t) => ({ label: t, action: { type: "PICK_TIME", time: t } }));
    }
  };

  if (!slot) { say(c, T.timeOffGrid); return suggestTimes(); }
  if (!slot.available) {
    say(c, slot.reason === "past" ? T.timePast(time) : slot.reason === "overflow" ? T.timeOverflow(time) : T.timeBooked(time));
    return suggestTimes();
  }
  if (c.mode === "reschedule" && c.target && c.target.dateKey === c.draft.dateKey && c.target.time === time) {
    return say(c, T.sameAsCurrent);
  }
  c.draft.time = time;
  return enterConfirm(c);
}

function changeField(c, fx, field) {
  if (c.state !== S.CONFIRM) return undefined; // clique em card antigo
  if (c.mode === "reschedule" && (field === "services" || field === "barber")) return say(c, T.cannotChangeInReschedule);
  say(c, T.askWhatToChange);
  if (field === "services") { setServices(c, c.draft.services); return enterServices(c); }
  if (field === "barber") { c.draft.barber = null; c.draft.dateKey = null; c.draft.time = null; return enterBarber(c, fx); }
  if (field === "date") { c.draft.dateKey = null; c.draft.time = null; return enterDate(c); }
  c.draft.time = null;
  return reloadTimes(c, fx);
}

function confirmBooking(c, fx) {
  if (c.state !== S.CONFIRM) return undefined;
  const d = c.draft;
  if (!d.services.length || !d.barber || !d.dateKey || !d.time) {
    say(c, T.incomplete);
    return resume(c, fx);
  }
  // Revalida: o cliente pode ter deixado o resumo aberto por muito tempo.
  const barberSchedule = d.barber?.schedules ?? d.barber?.schedule ?? null;
  const dateProblem = checkDate(d.dateKey, c.now, barberSchedule);
  if (dateProblem) {
    say(c, T.dateError(dateProblem));
    d.dateKey = null; d.time = null;
    return enterDate(c);
  }
  const slot = selectSlots(c).find((s) => s.time === d.time);
  if (!slot || !slot.available) {
    say(c, slot?.reason === "past" ? T.timePast(d.time) : T.timeBooked(d.time));
    d.time = null;
    return reloadTimes(c, fx);
  }

  c.state = S.WORKING;
  const payload = { client: { ...c.client }, dateKey: d.dateKey, time: d.time };
  if (c.mode === "reschedule") {
    return fx.push({ type: "SAVE_RESCHEDULE", ...payload, target: c.target });
  }
  return fx.push({ type: "SAVE_BOOKING", ...payload, barberId: d.barber.id, serviceIds: d.services.map((s) => s.id) });
}

/* ============================ pós-agendamento ============================== */

function viewAppointments(c, fx, mode = "view", { shortcut = true } = {}) {
  resetFlow(c);
  if (!c.client.phone) {
    c.afterIdentity = { type: "VIEW_APPOINTMENTS", mode };
    return askPhone(c);
  }
  c.state = S.LIST_APPOINTMENTS;
  c.appointments = { status: "loading", groups: [], intent: mode, shortcut };
  say(c, T.searching);
  return fx.push({ type: "LOAD_APPOINTMENTS", phone: c.client.phone, catalog: c.catalog });
}

function pickAppointment(c, fx, key, op) {
  if (c.state !== S.LIST_APPOINTMENTS) return undefined;
  const group = c.appointments.groups.find((g) => g.key === key);
  if (!group) return say(c, T.appointmentsError);

  if (op === "cancel") {
    c.target = group;
    c.state = S.CONFIRM_CANCEL;
    return say(c, T.confirmCancel(group.serviceNames.join(" + "), group.barberName, whenText(group)));
  }

  // reagendar: reconstrói o rascunho a partir da reserva existente
  const services = group.serviceIds.map((id) => c.catalog.services.find((s) => s.id === id)).filter(Boolean);
  if (c.catalog.status !== "ready" || services.length !== group.serviceIds.length) return say(c, T.catalogError);
  const barber = c.catalog.barbers.find((b) => b.id === group.barberId) ?? { id: group.barberId, name: group.barberName, image: "" };
  c.mode = "reschedule";
  c.target = group;
  c.draft = { services, barber, dateKey: null, time: null };
  return enterDate(c);
}

/* ============================== texto livre ================================ */

/** Interpreta texto conforme o estado. Devolve true se entendeu (mesmo que seja para reclamar do dado). */
function stateText(c, fx, text) {
  switch (c.state) {
    case S.ASK_NAME: {
      const r = parseName(text);
      if (!r.ok) { say(c, r.message); return true; }
      c.client = { ...c.client, name: r.name };
      fx.push({ type: "PERSIST_CLIENT", client: { ...c.client } });
      askPhone(c);
      return true;
    }
    case S.ASK_PHONE: {
      if (!isValidPhone(text)) { say(c, T.invalidPhone); return true; }
      c.client = { ...c.client, phone: normalizePhone(text) };
      fx.push({ type: "PERSIST_CLIENT", client: { ...c.client } });
      finishIdentity(c, fx);
      return true;
    }
    case S.CHOOSE_SERVICES: {
      if (c.catalog.status !== "ready") return false;
      if (isContinue(text)) { confirmServices(c, fx); return true; }

      const indices = parseIndexList(text, c.catalog.services.length);
      if (indices) {
        const picked = indices.map((i) => c.catalog.services[i]);
        setServices(c, [...c.draft.services, ...picked.filter((p) => !c.draft.services.some((s) => s.id === p.id))]);
        say(c, T.servicesAdded(c.draft.services.map((s) => s.name).join(" + "), formatPrice(getTotalPrice(c.draft.services))));
        return true;
      }

      const m = matchServices(text, c.catalog.services);
      if (!m.ids.length && !m.ambiguous.length) return false;
      if (m.ids.length) {
        const added = m.ids.map((id) => c.catalog.services.find((s) => s.id === id));
        setServices(c, [...c.draft.services, ...added.filter((p) => !c.draft.services.some((s) => s.id === p.id))]);
        say(c, T.servicesAdded(c.draft.services.map((s) => s.name).join(" + "), formatPrice(getTotalPrice(c.draft.services))));
      }
      if (m.ambiguous.length) {
        const first = m.ambiguous[0];
        say(c, T.askWhichService(first.query));
        c.suggest = first.candidates.map((s) => ({ label: s.name, bubble: s.name, action: { type: "TOGGLE_SERVICE", id: s.id } }));
      }
      if (m.unknown.length) say(c, T.unknownService(m.unknown[0]));
      return true;
    }
    case S.CHOOSE_BARBER: {
      const found = matchBarber(text, c.catalog.barbers);
      if (!found) return false;
      return pickBarber(c, found === "any" ? "any" : found.id);
    }
    case S.CHOOSE_DATE: {
      const barberSchedule = c.draft.barber?.schedules ?? c.draft.barber?.schedule ?? null;
      const d = parseDate(text, c.now, barberSchedule);
      if (!d) return false;
      if (d.reason) { say(c, T.dateError(d.reason)); return true; }
      pickDate(c, fx, d.dateKey, parseTime(text));
      return true;
    }
    case S.CHOOSE_TIME: {
      const barberSchedule = c.draft.barber?.schedules ?? c.draft.barber?.schedule ?? null;
      const d = parseDate(text, c.now, barberSchedule);
      if (d?.reason) { say(c, T.dateError(d.reason)); return true; }
      if (d) { pickDate(c, fx, d.dateKey, parseTime(text)); return true; }
      const t = parseTime(text, { allowBareHour: true });
      if (!t) return false;
      pickTime(c, t);
      return true;
    }
    case S.CONFIRM: {
      if (isYes(text)) { confirmBooking(c, fx); return true; }
      if (isNo(text)) { say(c, T.askWhatToChange); return true; }
      const field = parseChangeField(text);
      if (field) { changeField(c, fx, field); return true; }
      const t = parseTime(text);
      if (t) { pickTime(c, t); return true; }
      const barberSchedule = c.draft.barber?.schedules ?? c.draft.barber?.schedule ?? null;
      const d = parseDate(text, c.now, barberSchedule);
      if (d?.reason) { say(c, T.dateError(d.reason)); return true; }
      if (d) { pickDate(c, fx, d.dateKey, parseTime(text)); return true; }
      return false;
    }
    case S.CONFIRM_CANCEL: {
      if (isYes(text)) { handle(c, fx, { type: "CONFIRM_CANCEL_YES" }); return true; }
      if (isNo(text)) { handle(c, fx, { type: "CANCEL_ABORT" }); return true; }
      return false;
    }
    default:
      return false;
  }
}

function fallback(c) {
  c.fails += 1;
  const hint = HINTS[c.state] ?? T.menuHint;
  say(c, c.fails === 1 ? T.fallback1(hint) : c.fails === 2 ? T.fallback2(hint) : T.fallback3(hint));
  if (c.fails >= 2) emitWidgetFor(c); // reaparece as opções para o usuário se achar
}

const EXACT_COMMANDS = new Set(["GO_MENU", "GO_BACK"]);

function onText(c, fx, text) {
  const scope = scopeOf(c.state);
  const global = detectGlobalIntent(text, { scope });

  if (global && (scope === "idle" || EXACT_COMMANDS.has(global.type) || global.type === "HELP")) {
    c.fails = 0;
    return handle(c, fx, global);
  }
  if (stateText(c, fx, text)) { c.fails = 0; return undefined; }
  if (global) { c.fails = 0; return handle(c, fx, global); }
  return fallback(c);
}

/* ================================== voltar ================================= */

function goBack(c, fx) {
  switch (c.state) {
    case S.MENU: return say(c, T.alreadyMenu);
    case S.ASK_NAME:
    case S.CHOOSE_SERVICES:
    case S.LIST_APPOINTMENTS:
    case S.DONE:
      return enterMenu(c);
    case S.ASK_PHONE:
      return c.afterIdentity?.type === "START_BOOKING" && !c.client.name ? askName(c) : enterMenu(c);
    case S.CHOOSE_BARBER:
      c.draft.barber = null;
      return enterServices(c);
    case S.CHOOSE_DATE:
      if (c.mode === "reschedule") return viewAppointments(c, fx, "reschedule", { shortcut: false }); // sem atalho: senão "voltar" reentraria no mesmo passo
      c.draft.dateKey = null;
      c.draft.barber = null;
      return getEligibleBarbers(c.catalog, c.draft.services).length > 1 ? enterBarber(c, fx) : enterServices(c);
    case S.CHOOSE_TIME:
      c.draft.dateKey = null;
      c.draft.time = null;
      return enterDate(c);
    case S.CONFIRM:
      c.draft.time = null;
      return reloadTimes(c, fx);
    case S.CONFIRM_CANCEL:
      c.target = null;
      c.state = S.LIST_APPOINTMENTS;
      return say(c, T.appointmentsFound(c.appointments.groups.length, c.appointments.intent), { type: "appointments" });
    default:
      return undefined;
  }
}

/* ================================ despachante =============================== */

/** Actions que vêm de efeitos assíncronos — nunca barradas pelo estado WORKING. */
const RESULT_ACTIONS = new Set([
  "BOOT_DONE", "CATALOG_LOADED", "CATALOG_FAILED", "AVAILABILITY_LOADED", "AVAILABILITY_FAILED",
  "APPOINTMENTS_LOADED", "APPOINTMENTS_FAILED", "SAVE_OK", "SAVE_CONFLICT", "SAVE_FAILED", "CANCEL_OK", "CANCEL_FAILED",
]);

function handle(c, fx, a) {
  if (c.state === S.BOOT && a.type !== "BOOT_DONE") return undefined;
  if (c.state === S.WORKING && !RESULT_ACTIONS.has(a.type)) return say(c, T.working);

  switch (a.type) {
    /* ---- ciclo de vida ---- */
    case "BOOT_DONE": {
      if (c.state !== S.BOOT) return undefined; // StrictMode / chamada dupla
      c.client = { name: a.client?.name ?? "", phone: normalizePhone(a.client?.phone ?? "") };
      c.state = S.MENU;
      say(c, c.client.name ? T.welcomeBack(c.client.name) : `${T.welcomeNew}\n${T.menuHint}`);
      return fx.push({ type: "LOAD_CATALOG" });
    }
    case "TEXT": return onText(c, fx, a.text);

    /* ---- globais ---- */
    case "GO_MENU": return enterMenu(c);
    case "GO_BACK": return goBack(c, fx);
    case "START_BOOKING": return startBooking(c, fx);
    case "VIEW_APPOINTMENTS": return viewAppointments(c, fx, a.mode ?? "view");
    case "RESET_IDENTITY":
      resetFlow(c);
      c.client = { name: "", phone: "" };
      fx.push({ type: "CLEAR_CLIENT" });
      c.afterIdentity = { type: "IDENTITY_UPDATED" };
      say(c, T.identityReset);
      return askName(c);
    case "IDENTITY_UPDATED": return enterMenu(c, { text: `${T.identityDone}\n${T.menuAgain}` });
    case "VIEW_CATALOG":
      if (c.catalog.status === "loading") say(c, T.loadingCatalog);
      else if (c.catalog.status === "error") say(c, T.catalogError);
      else say(c, T.priceListIntro, { type: "catalogView", services: c.catalog.services.map((s) => ({ ...s, priceText: formatPrice(s.price) })) });
      return afterInfo(c);
    case "VIEW_HOURS":
      say(c, T.hoursIntro, { type: "hours", rows: hoursRows() });
      return afterInfo(c);
    case "HELP":
      say(c, T.help());
      return afterInfo(c);
    case "GREETING":
      return enterMenu(c, { text: c.client.name ? T.welcomeBack(c.client.name) : T.menuAgain });
    case "THANKS": return say(c, T.thanks);
    case "REPROMPT": return reprompt(c);

    /* ---- catálogo ---- */
    case "CATALOG_LOADED":
      c.catalog = { status: "ready", services: a.catalog.services, barbers: a.catalog.barbers, links: a.catalog.links };
      return c.state === S.CHOOSE_SERVICES ? enterServices(c) : undefined;
    case "CATALOG_FAILED":
      c.catalog = { ...c.catalog, status: "error" };
      return c.state === S.CHOOSE_SERVICES ? enterServices(c) : undefined;
    case "RETRY_CATALOG":
      if (c.catalog.status === "loading") return undefined;
      c.catalog = { ...c.catalog, status: "loading" };
      fx.push({ type: "LOAD_CATALOG" });
      return enterServices(c);

    /* ---- agendamento: seleções ---- */
    case "TOGGLE_SERVICE":
      return c.state === S.CHOOSE_SERVICES ? toggleService(c, a.id) : undefined;
    case "CONFIRM_SERVICES":
      return c.state === S.CHOOSE_SERVICES ? confirmServices(c, fx) : undefined;
    case "PICK_BARBER":
      return c.state === S.CHOOSE_BARBER ? void pickBarber(c, a.id) : undefined;
    case "PICK_DATE":
      return c.state === S.CHOOSE_DATE || c.state === S.CHOOSE_TIME || c.state === S.CONFIRM ? pickDate(c, fx, a.date) : undefined;
    case "PICK_TIME":
      return c.state === S.CHOOSE_TIME || c.state === S.CONFIRM ? pickTime(c, a.time) : undefined;
    case "CHANGE_FIELD": return changeField(c, fx, a.field);
    case "CONFIRM_BOOKING": return confirmBooking(c, fx);

    /* ---- disponibilidade (resultado assíncrono) ---- */
    case "AVAILABILITY_LOADED": {
      if (c.state !== S.CHOOSE_TIME || a.key !== c.availability.key) return undefined; // resposta velha
      c.availability = { status: "ready", key: a.key, booked: a.booked };
      const slots = selectSlots(c);
      if (!slots.some((s) => s.available)) {
        say(c, slots.length && slots.every((s) => s.reason === "past") ? T.dayOver : T.dayFull);
        c.draft.dateKey = null; c.draft.time = null; c.pendingTime = null;
        return enterDate(c);
      }
      if (c.pendingTime) {
        const time = c.pendingTime;
        c.pendingTime = null;
        return pickTime(c, time);
      }
      return undefined;
    }
    case "AVAILABILITY_FAILED":
      if (c.state !== S.CHOOSE_TIME || a.key !== c.availability.key) return undefined;
      c.availability = { ...c.availability, status: "error" };
      return say(c, T.availabilityError);
    case "RETRY_AVAILABILITY":
      return c.state === S.CHOOSE_TIME ? reloadTimes(c, fx) : undefined;

    /* ---- consulta / cancelamento / reagendamento ---- */
    case "APPOINTMENTS_LOADED": {
      if (c.state !== S.LIST_APPOINTMENTS || c.appointments.status !== "loading") return undefined;
      const { intent, shortcut } = c.appointments;
      c.appointments = { status: "ready", groups: a.groups, intent, shortcut };
      if (!a.groups.length) return say(c, T.noAppointments);
      if (a.groups.length === 1 && intent !== "view" && shortcut !== false) return pickAppointment(c, fx, a.groups[0].key, intent);
      return say(c, T.appointmentsFound(a.groups.length, intent), { type: "appointments" });
    }
    case "APPOINTMENTS_FAILED":
      if (c.state !== S.LIST_APPOINTMENTS) return undefined;
      c.appointments = { ...c.appointments, status: "error" };
      return say(c, T.appointmentsError);
    case "RETRY_LIST": return viewAppointments(c, fx, c.appointments.intent);
    case "PICK_APPOINTMENT": return pickAppointment(c, fx, a.key, a.op);
    case "CONFIRM_CANCEL_YES":
      if (c.state !== S.CONFIRM_CANCEL || !c.target) return undefined;
      c.state = S.WORKING;
      return fx.push({ type: "CANCEL", ids: c.target.ids, phone: c.client.phone });
    case "CANCEL_ABORT":
      if (c.state !== S.CONFIRM_CANCEL) return undefined;
      c.target = null;
      c.state = S.DONE;
      return say(c, T.keptAppointment);

    /* ---- resultados de gravação ---- */
    case "SAVE_OK": {
      if (c.state !== S.WORKING) return undefined;
      const summary = selectSummary(c);
      say(c, a.kind === "reschedule" ? T.rescheduled : T.booked, { type: "receipt", summary });
      resetFlow(c);
      c.state = S.DONE;
      return undefined;
    }
    case "SAVE_CONFLICT":
      if (c.state !== S.WORKING) return undefined;
      say(c, T.slotTaken);
      c.draft.time = null;
      return startAvailability(c, fx);
    case "SAVE_FAILED":
      if (c.state !== S.WORKING) return undefined;
      c.state = S.CONFIRM;
      return say(c, `Não foi possível concluir: ${a.message}`);
    case "CANCEL_OK":
      if (c.state !== S.WORKING) return undefined;
      resetFlow(c);
      c.state = S.DONE;
      return say(c, T.cancelled);
    case "CANCEL_FAILED":
      if (c.state !== S.WORKING) return undefined;
      c.state = S.CONFIRM_CANCEL;
      return say(c, `Não foi possível cancelar: ${a.message}`);

    default:
      return undefined; // action desconhecida: ignora (nunca quebra)
  }
}

/* ================================= entrada ================================= */

/**
 * @param {object} prev contexto atual (imutável)
 * @param {{type: string, now?: number, bubble?: string, [k: string]: any}} action
 * @returns {{ ctx: object, effects: object[] }}
 */
export function reduce(prev, action) {
  if (action.type === "TEXT" && !String(action.text ?? "").trim()) return { ctx: prev, effects: [] };

  const c = {
    ...prev,
    now: action.now ?? prev.now,
    messages: [...prev.messages],
    draft: { ...prev.draft, services: [...prev.draft.services] },
    suggest: [],
  };
  const fx = [];

  if (action.type === "TEXT") push(c, { from: "user", text: String(action.text).trim() });
  else if (action.bubble) push(c, { from: "user", text: action.bubble });

  handle(c, fx, action);

  if (c.messages.length > 150) c.messages = c.messages.slice(-120); // memória limitada
  return { ctx: c, effects: fx };
}
