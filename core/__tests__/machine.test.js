import test from "node:test";
import assert from "node:assert/strict";
import { createSession, group, CATALOG, NOW } from "./helpers.js";
import { S } from "../conversation/states.js";
import { quickRepliesFor } from "../conversation/quickReplies.js";
import { selectSlots } from "../conversation/selectors.js";

const KNOWN = { name: "Eduardo", phone: "83999999999" };
const MATHEUS = CATALOG.barbers[0].id;

/* --------------------------------- fluxo feliz --------------------------------- */

test("novo cliente: nome → telefone → serviço → barbeiro → data → horário → confirma → grava", () => {
  const s = createSession();
  assert.equal(s.ctx.state, S.MENU);
  s.send({ type: "START_BOOKING" });
  assert.equal(s.ctx.state, S.ASK_NAME);
  s.text("Eduardo");
  assert.equal(s.ctx.state, S.ASK_PHONE);
  s.text("(83) 99999-9999");
  assert.equal(s.ctx.state, S.CHOOSE_SERVICES);
  assert.deepEqual(s.ctx.client, KNOWN);
  assert.ok(s.log.effects.some((e) => e.type === "PERSIST_CLIENT"));

  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  assert.equal(s.ctx.state, S.CHOOSE_BARBER);
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  assert.equal(s.ctx.state, S.CHOOSE_DATE);
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  assert.equal(s.ctx.state, S.CHOOSE_TIME);
  assert.equal(s.ctx.availability.status, "ready");
  s.send({ type: "PICK_TIME", time: "10:00" });
  assert.equal(s.ctx.state, S.CONFIRM);
  s.send({ type: "CONFIRM_BOOKING" });
  assert.equal(s.ctx.state, S.DONE);
  const save = s.log.effects.find((e) => e.type === "SAVE_BOOKING");
  assert.deepEqual(save.serviceIds, ["degrade"]);
  assert.equal(save.time, "10:00");
  assert.equal(save.dateKey, "2026-10-06");
  assert.equal(s.ctx.messages.at(-1).widget.type, "receipt");
});

test("cliente conhecido pula cadastro; tudo por texto livre", () => {
  const s = createSession({ client: KNOWN });
  assert.match(s.last(), /bem-vindo de volta/i);
  s.text("quero agendar");
  assert.equal(s.ctx.state, S.CHOOSE_SERVICES);
  s.text("degradê e limpeza de pele");
  assert.deepEqual(s.ctx.draft.services.map((x) => x.id).sort(), ["degrade", "limpeza-pele"]); // a ordem de digitação não importa
  s.text("continuar");
  assert.equal(s.ctx.state, S.CHOOSE_BARBER);
  s.text("matheus");
  assert.equal(s.ctx.state, S.CHOOSE_DATE);
  s.text("amanhã às 15h");
  // data + hora na mesma frase: o horário fica pendente até a disponibilidade carregar e então é aplicado
  s.send({ type: "ACTION_QUE_NAO_EXISTE" }); // action desconhecida é ignorada sem quebrar
  assert.equal(s.ctx.state, S.CONFIRM);
  assert.equal(s.ctx.draft.time, "15:00");
  s.text("sim");
  assert.equal(s.ctx.state, S.DONE);
});

test("serviço restrito: só William aparece como elegível e é pulado automaticamente", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "freestyle" });
  s.send({ type: "CONFIRM_SERVICES" });
  assert.equal(s.ctx.state, S.CHOOSE_DATE);
  assert.equal(s.ctx.draft.barber.name, "William");
  assert.match(s.texts().join("\n"), /Só o \*\*William\*\*/);
});

test("tentar barbeiro que não faz o serviço é recusado com explicação", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "TOGGLE_SERVICE", id: "freestyle" });
  s.send({ type: "CONFIRM_SERVICES" }); // só William → pula; volta para testar via texto
  s.send({ type: "GO_BACK" });
  assert.equal(s.ctx.state, S.CHOOSE_SERVICES);
});

/* ------------------------------ horários e conflitos ------------------------------ */

test("horário ocupado: recusa, sugere vizinhos e oferece chips", () => {
  const s = createSession({ client: KNOWN, backend: { booked: ["10:00"] } });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  s.text("10h");
  assert.equal(s.ctx.state, S.CHOOSE_TIME);
  assert.match(s.last(), /9:30|09:30|10:30/);
  assert.match(s.texts().join("\n"), /já está ocupado/);
  assert.ok(s.ctx.suggest.length > 0);
  s.send(s.ctx.suggest[0].action);
  assert.equal(s.ctx.state, S.CONFIRM);
});

test("hoje: horários que já passaram não podem ser escolhidos", () => {
  const s = createSession({ client: KNOWN }); // NOW = segunda 10:00; abre 14:30
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-05" });
  assert.equal(s.ctx.state, S.CHOOSE_TIME);
  assert.ok(selectSlots(s.ctx).every((x) => x.available)); // 14:30+ ainda é futuro

  const late = createSession({ client: KNOWN, now: Date.parse("2026-10-05T19:30:00-03:00") });
  late.send({ type: "START_BOOKING" });
  late.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  late.send({ type: "CONFIRM_SERVICES" });
  late.send({ type: "PICK_BARBER", id: MATHEUS });
  late.send({ type: "PICK_DATE", date: "2026-10-05" });
  assert.equal(late.ctx.state, S.CHOOSE_DATE); // dia encerrado → volta a pedir a data
  assert.match(late.texts().join("\n"), /não há mais horários/);
});

test("dia lotado volta para a escolha de data", () => {
  const all = Array.from({ length: 20 }, (_, i) => `${String(9 + Math.floor(i / 2)).padStart(2, "0")}:${i % 2 ? "30" : "00"}`);
  const s = createSession({ client: KNOWN, backend: { booked: all } });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  assert.equal(s.ctx.state, S.CHOOSE_DATE);
  assert.match(s.texts().join("\n"), /lotado/);
});

test("conflito na gravação (alguém reservou antes): recarrega horários e pede outro", () => {
  let calls = 0;
  const s = createSession({
    client: KNOWN,
    backend: {
      saveBooking: () => (++calls === 1 ? { kind: "conflict" } : { kind: "ok" }),
      booked: (fx) => (calls >= 1 ? ["10:00"] : []),
    },
  });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  s.send({ type: "PICK_TIME", time: "10:00" });
  s.send({ type: "CONFIRM_BOOKING" });
  assert.equal(s.ctx.state, S.CHOOSE_TIME);
  assert.equal(s.ctx.draft.time, null);
  assert.match(s.texts().join("\n"), /acabou de ser reservado/);
  assert.ok(selectSlots(s.ctx).find((x) => x.time === "10:00").reason === "booked");
});

test("falha de rede na gravação mantém o resumo para tentar de novo", () => {
  let first = true;
  const s = createSession({ client: KNOWN, backend: { saveBooking: () => (first ? ((first = false), { kind: "fail", message: "sem conexão" }) : { kind: "ok" }) } });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  s.send({ type: "PICK_TIME", time: "10:00" });
  s.send({ type: "CONFIRM_BOOKING" });
  assert.equal(s.ctx.state, S.CONFIRM);
  assert.match(s.last(), /sem conexão/);
  s.text("sim");
  assert.equal(s.ctx.state, S.DONE);
});

test("respostas de rede atrasadas (disponibilidade de outro dia) são ignoradas", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  const before = s.ctx.availability;
  s.send({ type: "AVAILABILITY_LOADED", key: `${MATHEUS}|2026-10-07`, booked: ["09:00", "09:30"] });
  assert.equal(s.ctx.availability, before);
});

test("duplo clique em Confirmar não grava duas vezes (WORKING barra a entrada)", () => {
  const s = createSession({ client: KNOWN, backend: { saveBooking: () => null } }); // nunca responde
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  s.send({ type: "PICK_TIME", time: "10:00" });
  s.send({ type: "CONFIRM_BOOKING" });
  s.send({ type: "CONFIRM_BOOKING" });
  s.text("sim");
  assert.equal(s.ctx.state, S.WORKING);
  assert.equal(s.log.effects.filter((e) => e.type === "SAVE_BOOKING").length, 1);
});

/* ------------------------------- resiliência / navegação ------------------------------- */

test("'menu' funciona em qualquer estado e descarta o rascunho", () => {
  for (const state of ["services", "barber", "date", "time", "confirm"]) {
    const s = createSession({ client: KNOWN });
    s.send({ type: "START_BOOKING" });
    if (state !== "services") { s.send({ type: "TOGGLE_SERVICE", id: "degrade" }); s.send({ type: "CONFIRM_SERVICES" }); }
    if (["date", "time", "confirm"].includes(state)) s.send({ type: "PICK_BARBER", id: MATHEUS });
    if (["time", "confirm"].includes(state)) s.send({ type: "PICK_DATE", date: "2026-10-06" });
    if (state === "confirm") s.send({ type: "PICK_TIME", time: "10:00" });
    s.text("menu");
    assert.equal(s.ctx.state, S.MENU, state);
    assert.deepEqual(s.ctx.draft.services, [], state);
  }
});

test("'voltar' percorre os passos em ordem inversa até o menu", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  s.send({ type: "PICK_TIME", time: "10:00" });
  const trail = [];
  for (let i = 0; i < 6; i += 1) { s.text("voltar"); trail.push(s.ctx.state); }
  assert.deepEqual(trail, [S.CHOOSE_TIME, S.CHOOSE_DATE, S.CHOOSE_BARBER, S.CHOOSE_SERVICES, S.MENU, S.MENU]);
});

test("no resumo: trocar o horário/dia/barbeiro por texto", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "START_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "CONFIRM_SERVICES" });
  s.send({ type: "PICK_BARBER", id: MATHEUS });
  s.send({ type: "PICK_DATE", date: "2026-10-06" });
  s.send({ type: "PICK_TIME", time: "10:00" });
  s.text("14h"); // direto no resumo
  assert.equal(s.ctx.draft.time, "14:00");
  assert.equal(s.ctx.state, S.CONFIRM);
  s.text("quero trocar o horário");
  assert.equal(s.ctx.state, S.CHOOSE_TIME);
  s.send({ type: "PICK_TIME", time: "11:00" });
  s.text("mudar o barbeiro");
  assert.equal(s.ctx.state, S.CHOOSE_BARBER);
  assert.equal(s.ctx.draft.dateKey, null);
});

test("texto sem sentido: fallback progressivo, sem sair do passo, e reexibe opções", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "START_BOOKING" });
  s.text("asdfgh");
  assert.equal(s.ctx.state, S.CHOOSE_SERVICES);
  assert.match(s.last(), /Não entendi/);
  s.text("qwerty");
  assert.match(s.last(), /Ainda não consegui/);
  const widgets = s.ctx.messages.filter((m) => m.widget?.type === "services").length;
  assert.ok(widgets >= 2); // reapareceu
  s.text("zzz");
  assert.match(s.last(), /dificuldade/);
  s.text("degradê"); // e volta ao normal
  assert.equal(s.ctx.fails, 0);
  assert.equal(s.ctx.draft.services.length, 1);
});

test("frases fora do contexto no meio do fluxo: perguntar preço/horário não derruba o agendamento", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "START_BOOKING" });
  s.text("que horas vocês fecham hoje?");
  assert.equal(s.ctx.state, S.CHOOSE_SERVICES);
  assert.ok(s.ctx.messages.some((m) => m.widget?.type === "hours"));
  s.text("ajuda");
  assert.equal(s.ctx.state, S.CHOOSE_SERVICES);
});

test("serviço ambíguo ('barba') pergunta qual, com chips; escolher o chip adiciona", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "START_BOOKING" });
  s.text("barba");
  assert.match(s.last(), /mais de um serviço|Não encontrei|Qual deles/);
  assert.ok(s.ctx.suggest.length > 1);
  s.send(s.ctx.suggest[0].action);
  assert.equal(s.ctx.draft.services.length, 1);
});

test("nome inválido não avança; telefone inválido não avança; 'menu' escapa", () => {
  const s = createSession();
  s.send({ type: "START_BOOKING" });
  s.text("12345");
  assert.equal(s.ctx.state, S.ASK_NAME);
  s.text("Eduardo");
  s.text("123");
  assert.equal(s.ctx.state, S.ASK_PHONE);
  assert.match(s.last(), /válido/);
  s.text("menu");
  assert.equal(s.ctx.state, S.MENU);
});

test("catálogo com erro: mensagem + 'tentar novamente' funciona", () => {
  const s = createSession({ client: KNOWN });
  s.send({ type: "CATALOG_FAILED" });
  s.send({ type: "START_BOOKING" });
  assert.match(s.last(), /Não consegui carregar/);
  assert.ok(quickRepliesFor(s.ctx).some((c) => c.action.type === "RETRY_CATALOG"));
  s.send({ type: "RETRY_CATALOG" });
  assert.equal(s.ctx.catalog.status, "ready");
  assert.ok(s.ctx.messages.at(-1).widget?.type === "services");
});

test("clique em card velho / ação de estado errado é ignorado", () => {
  const s = createSession({ client: KNOWN });
  const before = s.ctx.messages.length;
  s.send({ type: "PICK_TIME", time: "10:00" });
  s.send({ type: "CONFIRM_BOOKING" });
  s.send({ type: "TOGGLE_SERVICE", id: "degrade" });
  s.send({ type: "SAVE_OK", kind: "book" });
  assert.equal(s.ctx.state, S.MENU);
  assert.equal(s.ctx.messages.length, before);
});

test("trocar meus dados limpa o cadastro e pede de novo", () => {
  const s = createSession({ client: KNOWN });
  s.text("quero trocar meu telefone");
  assert.equal(s.ctx.state, S.ASK_NAME);
  assert.ok(s.log.effects.some((e) => e.type === "CLEAR_CLIENT"));
  s.text("Maria");
  s.text("(83) 98888-7777");
  assert.equal(s.ctx.state, S.MENU);
  assert.equal(s.ctx.client.phone, "83988887777");
});

/* ------------------------- consulta / remarcar / cancelar ------------------------- */

test("consulta: sem telefone pede só o WhatsApp e depois lista", () => {
  const s = createSession({ backend: { appointments: [group()] } });
  s.text("meus agendamentos");
  assert.equal(s.ctx.state, S.ASK_PHONE);
  assert.match(s.last(), /WhatsApp/);
  s.text("(83) 99999-9999");
  assert.equal(s.ctx.state, S.LIST_APPOINTMENTS);
  assert.equal(s.ctx.appointments.groups.length, 1);
  assert.equal(s.ctx.messages.at(-1).widget.type, "appointments");
  assert.ok(s.log.effects.some((e) => e.type === "LOAD_APPOINTMENTS" && e.phone === "83999999999"));
});

test("consulta vazia", () => {
  const s = createSession({ client: KNOWN, backend: { appointments: [] } });
  s.text("meus agendamentos");
  assert.match(s.last(), /não tem agendamentos ativos/);
});

test("cancelar: lista → escolhe → confirma → CANCEL com os ids do grupo", () => {
  const g1 = group();
  const g2 = group({ key: "b1", ids: ["b1"], serviceIds: ["degrade"], serviceNames: ["Degradê"], dateKey: "2026-10-09", time: "09:00", rowTimes: ["09:00"] });
  const s = createSession({ client: KNOWN, backend: { appointments: [g1, g2] } });
  s.text("quero cancelar meu agendamento");
  assert.equal(s.ctx.state, S.LIST_APPOINTMENTS);
  assert.equal(s.ctx.appointments.intent, "cancel");
  s.send({ type: "PICK_APPOINTMENT", key: "a1,a2", op: "cancel" });
  assert.equal(s.ctx.state, S.CONFIRM_CANCEL);
  s.text("não");
  assert.equal(s.ctx.state, S.DONE);
  assert.match(s.last(), /mantive/);
  s.send({ type: "VIEW_APPOINTMENTS", mode: "cancel" });
  s.send({ type: "PICK_APPOINTMENT", key: "a1,a2", op: "cancel" });
  s.text("sim");
  assert.equal(s.ctx.state, S.DONE);
  const fx = s.log.effects.find((e) => e.type === "CANCEL");
  assert.deepEqual(fx.ids, ["a1", "a2"]);
  assert.equal(fx.phone, "83999999999");
  assert.match(s.last(), /cancelado/);
});

test("cancelar com UM agendamento ativo vai direto à confirmação", () => {
  const s = createSession({ client: KNOWN, backend: { appointments: [group()] } });
  s.text("cancelar meu horário");
  assert.equal(s.ctx.state, S.CONFIRM_CANCEL);
  assert.match(s.last(), /Quer mesmo cancelar/);
});

test("falha ao cancelar mantém a confirmação", () => {
  const s = createSession({ client: KNOWN, backend: { appointments: [group()], cancel: () => ({ kind: "fail", message: "tente de novo" }) } });
  s.text("cancelar meu horário");
  s.text("sim");
  assert.equal(s.ctx.state, S.CONFIRM_CANCEL);
  assert.match(s.last(), /tente de novo/);
});

test("remarcar: mantém serviços e barbeiro, só pede dia/horário e grava SAVE_RESCHEDULE", () => {
  const s = createSession({ client: KNOWN, backend: { appointments: [group()] } });
  s.text("quero remarcar");
  assert.equal(s.ctx.state, S.CHOOSE_DATE);
  assert.equal(s.ctx.mode, "reschedule");
  assert.deepEqual(s.ctx.draft.services.map((x) => x.id), ["degrade", "barba"]);
  assert.equal(s.ctx.draft.barber.name, "Matheus");
  s.text("quinta");
  assert.equal(s.ctx.state, S.CHOOSE_TIME);
  s.text("16h");
  assert.equal(s.ctx.state, S.CONFIRM);
  s.text("trocar o serviço");
  assert.match(s.last(), /só dá para mudar o dia e o horário/);
  s.text("sim");
  assert.equal(s.ctx.state, S.DONE);
  const fx = s.log.effects.find((e) => e.type === "SAVE_RESCHEDULE");
  assert.deepEqual(fx.target.ids, ["a1", "a2"]);
  assert.equal(fx.dateKey, "2026-10-08");
  assert.equal(fx.time, "16:00");
  assert.match(s.last(), /Remarcado/);
});

test("remarcar: o próprio horário atual não conta como ocupado e não pode ser repetido", () => {
  const s = createSession({ client: KNOWN, backend: { appointments: [group()], booked: ["15:00", "15:30", "16:00"] } });
  s.text("quero remarcar");
  s.send({ type: "PICK_DATE", date: "2026-10-07" }); // mesmo dia da reserva (15:00 + 15:30 são dela)
  const by = Object.fromEntries(selectSlots(s.ctx).map((x) => [x.time, x.reason]));
  assert.equal(by["15:00"], null); // 15:00 + 15:30 (60 min) cabem: as linhas da própria reserva não bloqueiam
  assert.equal(by["15:30"], "booked"); // 15:30 + 16:00 esbarraria no 16:00 de OUTRA pessoa
  assert.equal(by["16:00"], "booked");
  s.text("15h");
  assert.match(s.last(), /já é o horário do seu agendamento/);
  assert.equal(s.ctx.state, S.CHOOSE_TIME);
});

test("remarcar → voltar retorna à lista; conflito ao remarcar recarrega horários", () => {
  const s = createSession({ client: KNOWN, backend: { appointments: [group()], saveReschedule: () => ({ kind: "conflict" }) } });
  s.text("remarcar");
  assert.equal(s.ctx.state, S.CHOOSE_DATE); // 1 só agendamento: vai direto
  s.text("voltar");
  assert.equal(s.ctx.state, S.LIST_APPOINTMENTS); // "voltar" mostra a lista (sem reentrar no atalho)
  assert.equal(s.ctx.appointments.groups.length, 1);
  s.send({ type: "PICK_APPOINTMENT", key: "a1,a2", op: "reschedule" });
  s.send({ type: "PICK_DATE", date: "2026-10-08" });
  s.send({ type: "PICK_TIME", time: "10:00" });
  s.send({ type: "CONFIRM_BOOKING" });
  assert.equal(s.ctx.state, S.CHOOSE_TIME);
  assert.equal(s.ctx.mode, "reschedule"); // continua remarcando
});

test("chips são sempre coerentes com o estado (nunca vazios fora de BOOT/WORKING)", () => {
  const s = createSession({ client: KNOWN });
  assert.ok(quickRepliesFor(s.ctx).length >= 3);
  s.send({ type: "START_BOOKING" });
  assert.ok(quickRepliesFor(s.ctx).some((c) => c.action.type === "GO_MENU"));
});
