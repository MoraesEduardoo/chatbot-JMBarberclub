/**
 * Utilitários de data/hora na TIMEZONE DA BARBEARIA.
 *
 * Regra de ouro: datas trafegam como string "YYYY-MM-DD" e horas como "HH:MM".
 * Nunca usamos `new Date()` do aparelho do cliente para decidir "hoje" ou
 * "já passou" — um celular com fuso errado quebraria a agenda.
 */
import { SHOP } from "./config.js";

export const WEEKDAYS_SHORT = ["DOM", "SEG", "TER", "QUA", "QUI", "SEX", "SÁB"];
export const WEEKDAYS_LONG = ["domingo", "segunda-feira", "terça-feira", "quarta-feira", "quinta-feira", "sexta-feira", "sábado"];
export const MONTHS = ["Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
export const MONTHS_SHORT = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];

const pad = (n) => String(n).padStart(2, "0");
const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

const toUTC = (key) => {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
};
const fromUTC = (date) => `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;

export function isValidDateKey(key) {
  if (typeof key !== "string" || !DATE_RE.test(key)) return false;
  return fromUTC(toUTC(key)) === key; // rejeita 2026-02-31
}
export const isValidTime = (time) => typeof time === "string" && TIME_RE.test(time);

export function addDays(key, days) {
  const date = toUTC(key);
  date.setUTCDate(date.getUTCDate() + days);
  return fromUTC(date);
}
export const weekdayOf = (key) => toUTC(key).getUTCDay();
export const daysBetween = (fromKey, toKey) => Math.round((toUTC(toKey) - toUTC(fromKey)) / 86_400_000);

export const timeToMinutes = (time) => {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
};
export const minutesToTime = (total) => `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;

const clockFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: SHOP.timezone,
  year: "numeric", month: "2-digit", day: "2-digit",
  hour: "2-digit", minute: "2-digit", hourCycle: "h23",
});

function clockParts(date) {
  const parts = Object.fromEntries(clockFormatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

/** "Agora" na barbearia: { dateKey, minutes desde 00:00 }. */
export function shopClock(nowMs) {
  const { dateKey, time } = clockParts(new Date(nowMs));
  return { dateKey, minutes: timeToMinutes(time) };
}
export const todayKey = (nowMs) => shopClock(nowMs).dateKey;

/** timestamptz ISO (vindo do banco) → { dateKey, time } na timezone da barbearia. */
export const fromTimestamp = (iso) => clockParts(new Date(iso));
/** { dateKey, time } → timestamptz ISO com o offset da barbearia. */
export const toTimestamp = (dateKey, time) => `${dateKey}T${time}:00${SHOP.utcOffset}`;

/** "SEG, 5 de Outubro" */
export function formatDateLong(key) {
  const [, m, d] = key.split("-").map(Number);
  return `${WEEKDAYS_SHORT[weekdayOf(key)]}, ${d} de ${MONTHS[m - 1]}`;
}
export const formatPrice = (value) =>
  Number(value || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
