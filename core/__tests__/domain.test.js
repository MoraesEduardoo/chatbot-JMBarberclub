import test from "node:test";
import assert from "node:assert/strict";
import { isValidPhone, normalizePhone, formatPhone } from "../domain/phone.js";
import { getSlots, gridFor, checkDate, listBookableDays } from "../domain/availability.js";
import { addDays, isValidDateKey, weekdayOf, fromTimestamp, toTimestamp, todayKey } from "../domain/time.js";
import { getEligibleBarbers, getTotalDuration } from "../domain/eligibility.js";
import { groupAppointments } from "../domain/appointmentGroups.js";
import { CATALOG, NOW } from "./helpers.js";

test("telefone: normaliza, valida e formata", () => {
  assert.equal(normalizePhone("(83) 99999-9999"), "83999999999");
  assert.equal(normalizePhone("+55 83 99999-9999"), "83999999999");
  assert.ok(isValidPhone("83 99999-9999"));
  assert.ok(isValidPhone("(83) 3333-4444"));
  assert.ok(!isValidPhone("99999-9999")); // sem DDD
  assert.ok(!isValidPhone("(83) 89999-9999")); // celular sem 9
  assert.ok(!isValidPhone("(05) 99999-9999")); // DDD inexistente
  assert.equal(formatPhone("83999999999"), "(83) 99999-9999");
});

test("datas: validação, soma de dias e fuso da barbearia", () => {
  assert.ok(isValidDateKey("2026-10-05"));
  assert.ok(!isValidDateKey("2026-02-31"));
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(weekdayOf("2026-10-05"), 1); // segunda
  assert.equal(todayKey(NOW), "2026-10-05");
  // 01:00 UTC de 06/10 ainda é 22:00 de 05/10 em Campina Grande
  assert.equal(todayKey(Date.parse("2026-10-06T01:00:00Z")), "2026-10-05");
  assert.deepEqual(fromTimestamp("2026-10-07T18:00:00+00:00"), { dateKey: "2026-10-07", time: "15:00" });
  assert.equal(toTimestamp("2026-10-07", "15:00"), "2026-10-07T15:00:00-03:00");
});

test("grade: segunda abre 14:30–19:00 (9 horários), domingo 09:00–12:30 (7)", () => {
  assert.equal(gridFor("2026-10-05").length, 9);
  assert.equal(gridFor("2026-10-05")[0], "14:30");
  assert.equal(gridFor("2026-10-11").length, 7);
});

test("slots: passado, ocupado e duração que estoura o expediente", () => {
  const nowMs = Date.parse("2026-10-06T15:15:00-03:00"); // terça 15:15
  const slots = getSlots("2026-10-06", { nowMs, booked: ["16:00"] });
  const by = Object.fromEntries(slots.map((s) => [s.time, s.reason]));
  assert.equal(by["09:00"], "past");
  assert.equal(by["15:00"], "past");
  assert.equal(by["15:30"], null);
  assert.equal(by["16:00"], "booked");

  // 60 min = 2 células: 16:00 ocupado derruba 15:30; 18:30 não cabe (fecha 19:00)
  const long = Object.fromEntries(getSlots("2026-10-07", { nowMs, booked: ["10:00"], durationMinutes: 60 }).map((s) => [s.time, s.reason]));
  assert.equal(long["09:30"], "booked");
  assert.equal(long["10:00"], "booked");
  assert.equal(long["10:30"], null);
  assert.equal(long["18:30"], "overflow");
});

test("checkDate: passado, longe demais, ok", () => {
  assert.equal(checkDate("2026-10-04", NOW), "past");
  assert.equal(checkDate("2027-06-01", NOW), "too_far");
  assert.equal(checkDate("2026-10-05", NOW), null);
  assert.equal(listBookableDays(NOW).length, 180);
});

test("elegibilidade: vínculo barber_services manda; sem vínculo, só William faz serviços restritos", () => {
  const free = CATALOG.services.find((s) => s.id === "degrade");
  const restricted = CATALOG.services.find((s) => s.id === "freestyle");
  assert.equal(getEligibleBarbers(CATALOG, [free]).length, 2);
  assert.deepEqual(getEligibleBarbers(CATALOG, [free, restricted]).map((b) => b.name), ["William"]);

  const withLinks = { ...CATALOG, links: [{ serviceId: "degrade", barberId: CATALOG.barbers[0].id, customDurationMinutes: 45 }] };
  assert.deepEqual(getEligibleBarbers(withLinks, [free]).map((b) => b.name), ["Matheus"]);
  assert.equal(getTotalDuration(withLinks, [free], CATALOG.barbers[0].id), 45);
});

test("agrupamento: mesma transação (created_at) vira uma reserva; reservas separadas não se misturam", () => {
  const row = (id, serviceId, startsAt, batchKey) => ({ id, serviceId, serviceName: serviceId, barberId: "b1", barberName: "Matheus", startsAt, status: "pendente", batchKey });
  const rows = [
    row("1", "degrade", "2026-10-07T15:00:00-03:00", "T1"),
    row("2", "barba", "2026-10-07T15:30:00-03:00", "T1"),
    row("3", "degrade", "2026-10-07T16:00:00-03:00", "T2"), // outra reserva, colada na primeira
  ];
  const groups = groupAppointments(rows);
  assert.equal(groups.length, 2);
  assert.deepEqual(groups[0].ids, ["1", "2"]);
  assert.deepEqual(groups[0].rowTimes, ["15:00", "15:30"]);
});
