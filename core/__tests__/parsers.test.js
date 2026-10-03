import test from "node:test";
import assert from "node:assert/strict";
import { parseName, parseTime, parseDate, matchServices, matchBarber, parseIndexList, isYes, isNo, parseChangeField } from "../conversation/parsers.js";
import { detectGlobalIntent } from "../conversation/intents.js";
import { CATALOG, NOW } from "./helpers.js";

test("nome: extrai de frases, rejeita lixo", () => {
  assert.deepEqual(parseName("meu nome é joão da silva"), { ok: true, name: "João da Silva" });
  assert.deepEqual(parseName("  eduardo  "), { ok: true, name: "Eduardo" });
  assert.equal(parseName("oi").ok, false);
  assert.equal(parseName("123").ok, false);
  assert.equal(parseName("a").ok, false);
  assert.equal(parseName("joao@gmail.com").ok, false);
});

test("horário: formatos brasileiros", () => {
  assert.equal(parseTime("14:30"), "14:30");
  assert.equal(parseTime("às 14h30"), "14:30");
  assert.equal(parseTime("9h"), "09:00");
  assert.equal(parseTime("meio dia"), "12:00");
  assert.equal(parseTime("3 da tarde"), "15:00");
  assert.equal(parseTime("14", { allowBareHour: true }), "14:00");
  assert.equal(parseTime("14", { allowBareHour: false }), null);
  assert.equal(parseTime("14.30", { allowBareHour: true }), "14:30");
  assert.equal(parseTime("amanhã"), null);
});

test("data: relativas, dia da semana, dd/mm, 'dia N'", () => {
  // NOW = segunda 05/10/2026
  assert.deepEqual(parseDate("hoje", NOW), { dateKey: "2026-10-05" });
  assert.deepEqual(parseDate("amanhã", NOW), { dateKey: "2026-10-06" });
  assert.deepEqual(parseDate("depois de amanhã", NOW), { dateKey: "2026-10-07" });
  assert.deepEqual(parseDate("sexta", NOW), { dateKey: "2026-10-09" });
  assert.deepEqual(parseDate("segunda", NOW), { dateKey: "2026-10-05" }); // hoje conta
  assert.deepEqual(parseDate("15/10", NOW), { dateKey: "2026-10-15" });
  assert.deepEqual(parseDate("dia 20", NOW), { dateKey: "2026-10-20" });
  assert.deepEqual(parseDate("dia 3", NOW), { dateKey: "2026-11-03" }); // já passou neste mês
  assert.deepEqual(parseDate("01/10", NOW), { reason: "past" });
  assert.deepEqual(parseDate("31/02", NOW), { reason: "invalid" });
  assert.equal(parseDate("quero cortar", NOW), null);
  assert.equal(parseDate("14:30", NOW), null);
  assert.equal(parseDate("sex", NOW).dateKey, "2026-10-09");
});

test("serviços: nome completo, parcial, múltiplos e ambíguos", () => {
  const svc = CATALOG.services;
  const ids = (t) => matchServices(t, svc).ids;
  assert.deepEqual(ids("degradê"), ["degrade"]);
  assert.deepEqual(ids("quero fazer o limpeza de pele"), ["limpeza-pele"]);
  assert.deepEqual(ids("Corte Freestyle"), ["freestyle"]);
  assert.deepEqual(ids("degradê e limpeza de pele").sort(), ["degrade", "limpeza-pele"]);
  assert.deepEqual(ids("Degradê + Sobrancelha"), ["degrade-sobrancelha"]); // nome completo vence "degradê" + "sobrancelha"
  const amb = matchServices("barba", svc);
  assert.equal(amb.ids.length, 0);
  assert.ok(amb.ambiguous[0].candidates.length > 1);
  assert.deepEqual(matchServices("pizza", svc).ids, []);
});

test("barbeiro: nome, número e 'tanto faz'", () => {
  const b = CATALOG.barbers;
  assert.equal(matchBarber("com o William", b).name, "William");
  assert.equal(matchBarber("2", b).name, "William");
  assert.equal(matchBarber("tanto faz", b), "any");
  assert.equal(matchBarber("o outro", b), null);
});

test("números, sim/não, trocar campo", () => {
  assert.deepEqual(parseIndexList("1 e 3", 5), [0, 2]);
  assert.deepEqual(parseIndexList("1,2", 5), [0, 1]);
  assert.equal(parseIndexList("9", 5), null);
  assert.equal(parseIndexList("degradê", 5), null);
  assert.ok(isYes("Sim!") && isYes("pode ser") && isYes("confirmar"));
  assert.ok(isNo("não") && !isNo("nao sei"));
  assert.equal(parseChangeField("quero trocar o horário"), "time");
  assert.equal(parseChangeField("mudar o barbeiro"), "barber");
  assert.equal(parseChangeField("trocar o serviço"), "services");
});

test("intenções globais por escopo", () => {
  const g = (t, scope) => detectGlobalIntent(t, { scope })?.type ?? null;
  assert.equal(g("menu", "flow"), "GO_MENU");
  assert.equal(g("voltar", "flow"), "GO_BACK");
  assert.equal(g("cancelar", "flow"), "GO_MENU"); // desistir do fluxo
  assert.equal(g("cancelar", "idle"), "VIEW_APPOINTMENTS");
  assert.equal(g("quero cancelar meu agendamento", "flow"), "VIEW_APPOINTMENTS");
  assert.equal(g("quero remarcar", "idle"), "VIEW_APPOINTMENTS");
  assert.equal(g("meus agendamentos", "idle"), "VIEW_APPOINTMENTS");
  assert.equal(g("quais os preços?", "idle"), "VIEW_CATALOG");
  assert.equal(g("que horas vocês abrem hoje?", "idle"), "VIEW_HOURS");
  assert.equal(g("quero agendar", "idle"), "START_BOOKING");
  assert.equal(g("oi", "idle"), "GREETING");
  assert.equal(g("obrigado", "idle"), "THANKS");
  assert.equal(g("quero trocar meu telefone", "idle"), "RESET_IDENTITY");
  // aguardando nome/telefone: só comandos exatos
  assert.equal(g("Quero Agendar Silva", "strict"), null);
  assert.equal(g("menu", "strict"), "GO_MENU");
});
