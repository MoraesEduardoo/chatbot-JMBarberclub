/** Derivações do contexto usadas pela UI e pela máquina (nada é guardado em duplicidade). */
import { getSlots, listBookableDays } from "../domain/availability.js";
import { getEligibleBarbers, getTotalDuration, getTotalPrice } from "../domain/eligibility.js";
import { formatDateLong, formatPrice } from "../domain/time.js";

export const selectEligibleBarbers = (c) => getEligibleBarbers(c.catalog, c.draft.services);
export const selectBookableDays = (c) => listBookableDays(c.now);

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

export function selectSlots(c) {
  if (!c.draft.dateKey) return [];
  return getSlots(c.draft.dateKey, { nowMs: c.now, booked: selectBooked(c), durationMinutes: selectDuration(c) });
}

export function selectSummary(c) {
  const { services, barber, dateKey, time } = c.draft;
  const total = getTotalPrice(services);
  return {
    mode: c.mode,
    services: services.map((s) => ({ id: s.id, name: s.name, price: s.price, priceText: formatPrice(s.price) })),
    serviceNames: services.map((s) => s.name).join(" + "),
    total,
    totalText: formatPrice(total),
    barberName: barber?.name ?? "",
    dateText: dateKey ? formatDateLong(dateKey) : "",
    time: time ?? "",
    durationMinutes: selectDuration(c),
    previous: c.mode === "reschedule" && c.target ? { dateText: formatDateLong(c.target.dateKey), time: c.target.time } : null,
  };
}
