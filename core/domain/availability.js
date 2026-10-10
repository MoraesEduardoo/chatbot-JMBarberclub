/**
 * Regras de agenda: quais dias/horários podem ser oferecidos.
 * Funções puras — recebem `nowMs`, horários do banco e a lista de horários já ocupados.
 *
 * Consulta estrita de expediente (`barber_schedules`):
 * - Prioriza a escala individual cadastrada para o barbeiro no banco.
 * - Bloqueia dias marcados como folga/fechado (is_working = false ou closed = true).
 * - Se o profissional não trabalha em determinado dia (ex: Matheus na segunda-feira),
 *   esse dia NUNCA entra na lista de dias ofertados e é bloqueado com "closed".
 */
import { BUSINESS_HOURS, SLOT_MINUTES, MIN_LEAD_MINUTES, BOOKING_WINDOW_DAYS } from "./config.js";
import { addDays, weekdayOf, todayKey, shopClock, timeToMinutes, minutesToTime, WEEKDAYS_SHORT } from "./time.js";

const WEEKDAY_KEYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sab"];

/** 
 * Retorna o expediente e pausas do dia, priorizando os dados da tabela `barber_schedules`.
 * Se o barbeiro estiver fechado ou de folga no dia, retorna estritamente `null`.
 */
export function businessHoursOn(dateKey, barberSchedule = null) {
  const weekday = weekdayOf(dateKey); // 0 = domingo ... 6 = sábado

  // Se o banco ou contexto forneceu a escala específica do barbeiro
  if (barberSchedule && typeof barberSchedule === "object") {
    // Suporta chaves numéricas (0..6), string ("0".."6") ou siglas ("seg", "ter", etc.)
    const shortKey = WEEKDAY_KEYS[weekday];
    const custom = barberSchedule[weekday] ?? barberSchedule[String(weekday)] ?? barberSchedule[shortKey];

    if (custom) {
      // Verifica se o dia está explicitamente desativado / fechado / folga
      const isClosed =
        custom.is_working === false ||
        custom.closed === true ||
        custom.is_closed === true ||
        custom.is_active === false ||
        custom.status === "closed" ||
        custom.status === "fechado";

      if (isClosed) {
        return null; // Barbeiro de folga/fechado neste dia
      }

      // Se não tiver horários válidos configurados, também é considerado fechado
      if (!custom.start || !custom.end) {
        return null;
      }

      return custom;
    }

    // Se o barbeiro tem uma escala customizada cadastrada (objeto com chaves configuradas),
    // qualquer dia da semana ausente na escala significa que ele NÃO atende nesse dia.
    const hasConfiguredDays = Object.keys(barberSchedule).length > 0;
    if (hasConfiguredDays) {
      return null; // Dia não configurado na escala do barbeiro = Folga
    }
  }

  // Fallback para os horários gerais da barbearia (BUSINESS_HOURS)
  const defaultHours = BUSINESS_HOURS[weekday] ?? null;
  if (!defaultHours || defaultHours.closed === true || defaultHours.is_working === false) {
    return null;
  }

  return defaultHours;
}

/** Verifica de forma booleana se o barbeiro trabalha no dia especificado */
export function isBarberWorkingOn(dateKey, barberSchedule = null) {
  return businessHoursOn(dateKey, barberSchedule) !== null;
}

/** 
 * Datas (YYYY-MM-DD) em que o barbeiro selecionado realmente atende, de hoje até o fim da janela.
 * Filtra rigorosamente os dias de folga/fechados (ex: segunda-feira para barbeiros sem expediente).
 */
export function listBookableDays(nowMs, total = BOOKING_WINDOW_DAYS, barberSchedule = null) {
  const start = todayKey(nowMs);
  return Array.from({ length: total }, (_, i) => addDays(start, i)).filter((dateKey) => {
    const hours = businessHoursOn(dateKey, barberSchedule);
    if (!hours) return false;
    if (hours.closed === true || hours.is_working === false) return false;
    if (!hours.start || !hours.end) return false;
    return true;
  });
}

/** Todas as células de 30 min do expediente do dia, excluindo o horário de almoço/pausa vindo do banco. */
export function gridFor(dateKey, barberSchedule = null) {
  const hours = businessHoursOn(dateKey, barberSchedule);
  if (!hours || hours.closed || hours.is_working === false || !hours.start || !hours.end) return [];

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
  const hours = businessHoursOn(dateKey, barberSchedule);
  if (!hours || hours.closed === true || hours.is_working === false || !hours.start || !hours.end) {
    return "closed";
  }
  return null;
}