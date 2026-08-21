import { BUSINESS_HOURS } from "./data";

export const WEEKDAYS = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];

export const toDateKey = (date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
export const formatDate = (date) => `${WEEKDAYS[date.getDay()]}, ${date.getDate()} de ${MONTHS[date.getMonth()]}`;
export const formatPrice = (price) => price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function buildDays(offsetDays = 0, totalDays = 180) {
  const base = new Date(); base.setHours(0, 0, 0, 0); base.setDate(base.getDate() + offsetDays);
  return Array.from({ length: totalDays }, (_, index) => { const date = new Date(base); date.setDate(base.getDate() + index); return date; });
}

export function generateSlots(date) {
  const hours = BUSINESS_HOURS[date.getDay()];
  if (!hours) return [];
  const [startH, startM] = hours.start.split(":").map(Number); const [endH, endM] = hours.end.split(":").map(Number);
  const start = startH * 60 + startM; const end = endH * 60 + endM;
  return Array.from({ length: Math.floor((end - start) / 30) }, (_, index) => {
    const total = start + index * 30;
    return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  });
}
