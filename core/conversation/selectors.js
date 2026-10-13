import { getSlots, listBookableDays } from "../domain/availability.js";
import { getEligibleBarbers, getTotalDuration, getTotalPrice } from "../domain/eligibility.js";
import { formatDateLong, formatPrice } from "../domain/time.js";
import { CLEANING_BUFFER_MINUTES } from "../domain/config.js";

export const selectEligibleBarbers = (c) => getEligibleBarbers(c.catalog, c.draft.services);
export const selectBarberSchedule = (c) => c.draft.barber?.schedules ?? c.draft.barber?.schedule ?? null;
export const selectBookableDays = (c) => listBookableDays(c.now, undefined, selectBarberSchedule(c));

export function selectDuration(c) {
  return c.draft.barber ? getTotalDuration(c.catalog, c.draft.services, c.draft.barber.id) : 0;
}

/** Horários já ocupados, descontando as linhas da própria reserva que está sendo remarcada. */
export function selectBooked(c) {
  const booked = c.availability.booked ?? [];
  const target = c.target;
  if (c.mode === "reschedule" && target && target.dateKey === c.draft.dateKey) {
    const own = new Set(target.rowTimes ?? [target.time]);
    return booked.filter((time) => !own.has(time));
  }
  return booked;
}

/**
 * Regra 3: Motor de horários com soma dinâmica da duração dos serviços + respiro técnico (buffer) de limpeza.
 */
export function selectSlots(c) {
  if (!c.draft.dateKey) return [];
  const duration = selectDuration(c);
  // Regra 3: Quando múltiplos serviços forem selecionados, soma as durações e adiciona o buffer de limpeza
  const buffer = (c.draft.services && c.draft.services.length > 1) ? CLEANING_BUFFER_MINUTES : 0;
  return getSlots(c.draft.dateKey, {
    nowMs: c.now,
    booked: selectBooked(c),
    durationMinutes: duration,
    bufferMinutes: buffer,
    barberSchedule: selectBarberSchedule(c),
  });
}

export function selectSummary(c) {
  const { services, barber, dateKey, time } = c.draft;
  const total = getTotalPrice(services);
  const duration = selectDuration(c);
  return {
    mode: c.mode,
    services: services.map((s) => ({ id: s.id, name: s.name, price: s.price, priceText: formatPrice(s.price) })),
    serviceNames: services.map((s) => s.name).join(" + "),
    total,
    totalText: formatPrice(total),
    barberName: barber?.name ?? "",
    dateText: dateKey ? formatDateLong(dateKey) : "",
    time: time ?? "",
    durationMinutes: duration,
    bufferMinutes: CLEANING_BUFFER_MINUTES,
    totalBlockMinutes: duration + CLEANING_BUFFER_MINUTES,
    previous: c.mode === "reschedule" && c.target ? { dateText: formatDateLong(c.target.dateKey), time: c.target.time } : null,
  };
}
