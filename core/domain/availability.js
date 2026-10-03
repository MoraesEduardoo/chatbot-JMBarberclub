/**
 * Regras de agenda: quais dias/horários podem ser oferecidos.
 * Funções puras — recebem `nowMs` e a lista de horários já ocupados.
 */
import { BUSINESS_HOURS, SLOT_MINUTES, MIN_LEAD_MINUTES, BOOKING_WINDOW_DAYS } from "./config.js";
import { addDays, weekdayOf, todayKey, shopClock, timeToMinutes, minutesToTime } from "./time.js";

export const businessHoursOn = (dateKey) => BUSINESS_HOURS[weekdayOf(dateKey)] ?? null;

/** Datas (YYYY-MM-DD) em que a barbearia abre, de hoje até o fim da janela de agendamento. */
export function listBookableDays(nowMs, total = BOOKING_WINDOW_DAYS) {
  const start = todayKey(nowMs);
  return Array.from({ length: total }, (_, i) => addDays(start, i)).filter(businessHoursOn);
}

/** Todas as células de 30 min do expediente do dia (["09:00", "09:30", …]). */
export function gridFor(dateKey) {
  const hours = businessHoursOn(dateKey);
  if (!hours) return [];
  const start = timeToMinutes(hours.start);
  const end = timeToMinutes(hours.end);
  return Array.from({ length: Math.max(0, Math.floor((end - start) / SLOT_MINUTES)) }, (_, i) =>
    minutesToTime(start + i * SLOT_MINUTES),
  );
}

/**
 * Situação de cada horário do dia.
 * reason: null (livre) | "past" | "booked" | "overflow" (não cabe antes de fechar)
 *
 * `durationMinutes` = soma da duração dos serviços escolhidos. Um serviço de
 * 60 min ocupa 2 células; se a segunda já estiver ocupada, o horário é "booked".
 * LIMITAÇÃO: `booked` só traz horários de INÍCIO. Se a RPC chatbot_booked_times
 * não expandir agendamentos longos, um corte de 60 min já marcado às 10:00
 * deixará 10:30 livre para o chat — o banco é a fonte final da verdade.
 */
export function getSlots(dateKey, { nowMs, booked = [], durationMinutes = 0 } = {}) {
  const grid = gridFor(dateKey);
  const bookedSet = booked instanceof Set ? booked : new Set(booked);
  const needed = Math.max(1, Math.ceil(durationMinutes / SLOT_MINUTES));
  const clock = shopClock(nowMs);

  return grid.map((time, index) => {
    const start = timeToMinutes(time);
    const isPastDay = dateKey < clock.dateKey;
    const isPastToday = dateKey === clock.dateKey && start <= clock.minutes + MIN_LEAD_MINUTES;
    if (isPastDay || isPastToday) return { time, available: false, reason: "past" };

    const cells = grid.slice(index, index + needed);
    if (cells.length < needed) return { time, available: false, reason: "overflow" };
    if (cells.some((cell) => bookedSet.has(cell))) return { time, available: false, reason: "booked" };
    return { time, available: true, reason: null };
  });
}

/** Erro de uma data escolhida: null se válida, senão "past" | "too_far" | "closed". */
export function checkDate(dateKey, nowMs) {
  const today = todayKey(nowMs);
  if (dateKey < today) return "past";
  if (dateKey > addDays(today, BOOKING_WINDOW_DAYS - 1)) return "too_far";
  if (!businessHoursOn(dateKey)) return "closed";
  return null;
}
