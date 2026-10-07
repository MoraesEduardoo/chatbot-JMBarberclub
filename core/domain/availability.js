/**
 * Regras de agenda: quais dias/horários podem ser oferecidos.
 * Funções puras — recebem `nowMs`, horários do banco e a lista de horários já ocupados.
 */
import { BUSINESS_HOURS, SLOT_MINUTES, MIN_LEAD_MINUTES, BOOKING_WINDOW_DAYS } from "./config.js";
import { addDays, weekdayOf, todayKey, shopClock, timeToMinutes, minutesToTime } from "./time.js";

/** Retorna o expediente e pausas do dia, priorizando os dados do banco (`barberSchedule`) se existirem */
export function businessHoursOn(dateKey, barberSchedule = null) {
  const weekday = weekdayOf(dateKey); // ex: 'seg', 'ter', etc. ou índice numérico dependendo do seu config

  // Se o banco forneceu a escala específica do barbeiro para o dia
  if (barberSchedule && barberSchedule[weekday]) {
    return barberSchedule[weekday];
  }

  return BUSINESS_HOURS[weekday] ?? null;
}

/** Datas (YYYY-MM-DD) em que a barbearia abre, de hoje até o fim da janela de agendamento. */
export function listBookableDays(nowMs, total = BOOKING_WINDOW_DAYS, barberSchedule = null) {
  const start = todayKey(nowMs);
  return Array.from({ length: total }, (_, i) => addDays(start, i)).filter(
    (dateKey) => businessHoursOn(dateKey, barberSchedule) !== null
  );
}

/** Todas as células de 30 min do expediente do dia, excluindo o horário de almoço/pausa vindo do banco. */
export function gridFor(dateKey, barberSchedule = null) {
  const hours = businessHoursOn(dateKey, barberSchedule);
  if (!hours || hours.closed || !hours.start || !hours.end) return [];

  const start = timeToMinutes(hours.start);
  const end = timeToMinutes(hours.end);

  const allSlots = Array.from({ length: Math.max(0, Math.floor((end - start) / SLOT_MINUTES)) }, (_, i) =>
    minutesToTime(start + i * SLOT_MINUTES),
  );

  // Intervalo de almoço/pausa (suporta lunchStart/lunchEnd ou breakStart/breakEnd vindos de barber_schedules)
  const lStart = hours.lunchStart ?? hours.breakStart ?? null;
  const lEnd = hours.lunchEnd ?? hours.breakEnd ?? null;

  if (!lStart || !lEnd) return allSlots;

  const lunchStartMinutes = timeToMinutes(lStart);
  const lunchEndMinutes = timeToMinutes(lEnd);

  // Filtra removendo os horários que caem dentro da pausa de almoço
  return allSlots.filter((time) => {
    const minutes = timeToMinutes(time);
    if (minutes >= lunchStartMinutes && minutes < lunchEndMinutes) {
      return false; // Remove o horário de almoço
    }
    return true;
  });
}

/**
 * Situação de cada horário do dia.
 */
export function getSlots(dateKey, { nowMs, booked = [], durationMinutes = 0, barberSchedule = null } = {}) {
  const grid = gridFor(dateKey, barberSchedule);
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
export function checkDate(dateKey, nowMs, barberSchedule = null) {
  const today = todayKey(nowMs);
  if (dateKey < today) return "past";
  if (dateKey > addDays(today, BOOKING_WINDOW_DAYS - 1)) return "too_far";
  if (!businessHoursOn(dateKey, barberSchedule)) return "closed";
  return null;
}