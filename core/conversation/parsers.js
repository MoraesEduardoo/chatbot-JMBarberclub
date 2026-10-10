/**
 * Interpretação de texto livre (pt-BR): nomes, telefones, serviços, barbeiros,
 * datas e horários. Tudo puro e testável — nenhuma função aqui toca em estado.
 */
import { addDays, daysBetween, isValidDateKey, todayKey, weekdayOf } from "../domain/time.js";
import { checkDate } from "../domain/availability.js";

/** minúsculas, sem acentos, sem símbolos soltos, espaços colapsados. */
export const normalize = (value) =>
  String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9:+/\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const YES = /^(sim|s|isso|isso mesmo|confirm\w*|ok|okay|beleza|blz|pode|pode ser|claro|certo|fechado|bora|positivo|uhum|aham|perfeito|tudo certo|com certeza)$/;
const NO = /^(nao|n|negativo|nope|errado|incorreto|nao quero|nao confirmo)$/;
const CONTINUE = /^(continuar|continua|proximo|avancar|pronto|so isso|so esse|so esses|e isso|isso ai|finalizar|seguir|pode continuar|ja escolhi|prosseguir)$/;

export const isYes = (text) => YES.test(normalize(text));
export const isNo = (text) => NO.test(normalize(text));
export const isContinue = (text) => CONTINUE.test(normalize(text));

/* ------------------------------ nome ------------------------------ */

const RESERVED_NAMES = new Set([
  "oi", "ola", "opa", "eai", "hey", "bom dia", "boa tarde", "boa noite", "sim", "nao", "ok", "menu", "voltar",
  "cancelar", "ajuda", "inicio", "obrigado", "obrigada", "valeu", "tchau", "agendar", "marcar", "preco", "precos", "servicos",
]);
const SMALL_WORDS = new Set(["da", "de", "do", "das", "dos", "e"]);
const NAME_PREFIX = /^(?:meu nome (?:é|e|eh)|me chamo|eu sou|sou (?:o|a)?|pode me chamar de|me chama de|aqui (?:é|e|eh) (?:o|a)?)\s+/i;

const titleCase = (name) =>
  name
    .split(" ")
    .map((word, i) => (i > 0 && SMALL_WORDS.has(word.toLowerCase()) ? word.toLowerCase() : word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()))
    .join(" ");

/** @returns {{ok: true, name: string} | {ok: false, message: string}} */
export function parseName(text) {
  const cleaned = String(text ?? "").trim().replace(NAME_PREFIX, "").replace(/\s+/g, " ").trim();
  const letters = (cleaned.match(/\p{L}/gu) || []).length;
  if (RESERVED_NAMES.has(normalize(cleaned))) return { ok: false, message: "Isso não parece um nome 😅 Como posso te chamar?" };
  if (letters < 2 || /\d/.test(cleaned) || /@|https?:/i.test(cleaned)) return { ok: false, message: "Me diga só o seu nome, por favor (sem números ou símbolos)." };
  if (cleaned.length > 60 || cleaned.split(" ").length > 6) return { ok: false, message: "Esse nome ficou grande demais. Pode me dizer só o primeiro nome e o sobrenome?" };
  return { ok: true, name: titleCase(cleaned) };
}

/* --------------------------- números/índices --------------------------- */

/** "1", "1 e 3", "1,2" → [0], [0, 2], [0, 1] (índices base 0) ou null se não for só números válidos. */
export function parseIndexList(text, max) {
  const t = normalize(text);
  if (!/^\d+(?:\s*(?:,|e|\+|\s)\s*\d+)*$/.test(t)) return null;
  const nums = [...new Set((t.match(/\d+/g) || []).map(Number))];
  if (!nums.length || nums.some((n) => n < 1 || n > max)) return null;
  return nums.map((n) => n - 1);
}

/* ------------------------------ serviços ------------------------------ */

const STOP = new Set([
  "quero", "queria", "gostaria", "fazer", "agendar", "marcar", "preciso", "para", "pra", "por", "favor", "um", "uma", "o", "a", "os", "as",
  "de", "do", "da", "e", "com", "ou", "servico", "servicos", "tambem", "mais", "seria", "vou", "ai", "so", "tb",
]);
const tokens = (text) => normalize(text).split(/[^a-z0-9]+/).filter((t) => t.length >= 3 && !STOP.has(t));
const tokenMatch = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b) || b.startsWith(a)));

/**
 * Encontra serviços citados no texto. Conservador: se a frase serve para mais de um
 * serviço ("corte", "barba"), NÃO escolhe por conta própria — devolve `ambiguous`.
 * @returns {{ids: string[], ambiguous: {query: string, candidates: object[]}[], unknown: string[]}}
 */
export function matchServices(text, services) {
  const result = { ids: [], ambiguous: [], unknown: [] };
  let rest = ` ${normalize(text)} `;

  // 1) nome completo do serviço citado literalmente (mais longos primeiro)
  const byLength = [...services].sort((a, b) => normalize(b.name).length - normalize(a.name).length);
  for (const service of byLength) {
    const full = ` ${normalize(service.name)} `;
    if (rest.includes(full)) {
      result.ids.push(service.id);
      rest = rest.replace(full, " ");
    }
  }

  // 2) o que sobrou: separa por "," "+" "e" "mais" e casa palavra a palavra
  const parts = rest.split(/\s*(?:,|;|\+|\be\b|\bmais\b)\s*/).map((p) => p.trim()).filter(Boolean);
  for (const part of parts) {
    const queryTokens = tokens(part);
    if (!queryTokens.length) continue;
    const scored = services.map((service) => {
      const nameTokens = tokens(service.name);
      const hits = queryTokens.filter((q) => nameTokens.some((n) => tokenMatch(q, n))).length;
      return { service, hits };
    });
    const best = Math.max(...scored.map((s) => s.hits));
    if (best === 0) {
      result.unknown.push(part);
      continue;
    }
    const candidates = scored.filter((s) => s.hits === best).map((s) => s.service);
    if (candidates.length === 1) result.ids.push(candidates[0].id);
    else result.ambiguous.push({ query: part, candidates });
  }

  result.ids = [...new Set(result.ids)];
  return result;
}

/* ------------------------------ barbeiro ------------------------------ */

const ANY_BARBER = /\b(tanto faz|qualquer( um| uma)?|indiferente|sem preferencia|o que tiver|qualquer barbeiro)\b/;

/** @returns {"any" | object | null} barbeiro encontrado, "any" (sem preferência) ou null */
export function matchBarber(text, barbers) {
  const t = normalize(text);
  if (ANY_BARBER.test(t)) return "any";
  const index = parseIndexList(t, barbers.length);
  if (index?.length === 1) return barbers[index[0]];
  const found = barbers.filter((b) => new RegExp(`\\b${normalize(b.name)}\\b`).test(t));
  return found.length === 1 ? found[0] : null;
}

/* ------------------------------ horário ------------------------------ */

const pad2 = (n) => String(n).padStart(2, "0");

/**
 * "14:30", "14h30", "14h", "às 9", "meio dia", "3 da tarde" → "HH:MM" | null.
 * `allowBareHour` aceita só o número ("14") — usar apenas quando o estado espera um horário.
 */
export function parseTime(text, { allowBareHour = false } = {}) {
  const t = normalize(text);
  if (/\bmeio ?dia\b/.test(t)) return "12:00";

  let m = t.match(/\b([01]?\d|2[0-3])\s*(?:h|:)\s*([0-5]\d)\b/);
  if (m) return `${pad2(m[1])}:${m[2]}`;

  m = t.match(/\b([01]?\d|2[0-3])\s*(?:h|hs|horas?)\b/);
  if (m) return `${pad2(m[1])}:00`;

  m = t.match(/\b(\d{1,2})\s*(?:da|de)\s*(tarde|noite|manha)\b/);
  if (m) {
    let hour = Number(m[1]);
    if (hour > 12) return null;
    if (m[2] !== "manha" && hour < 12) hour += 12;
    return `${pad2(hour)}:00`;
  }

  if (allowBareHour) {
    m = t.match(/^(?:as |a )?([01]?\d|2[0-3])$/);
    if (m) return `${pad2(m[1])}:00`;
    m = t.match(/^(?:as |a )?([01]?\d|2[0-3]) ([0-5]\d)$/); // "14 30" / "14.30"
    if (m) return `${pad2(m[1])}:${m[2]}`;
  }
  return null;
}

/* -------------------------------- data -------------------------------- */

const WEEKDAY_WORDS = { domingo: 0, segunda: 1, terca: 2, quarta: 3, quinta: 4, sexta: 5, sabado: 6 };
const WEEKDAY_ABBR = { dom: 0, seg: 1, ter: 2, qua: 3, qui: 4, sex: 5, sab: 6 };

const validated = (dateKey, nowMs, barberSchedule = null) => {
  if (!isValidDateKey(dateKey)) return { reason: "invalid" };
  const reason = checkDate(dateKey, nowMs, barberSchedule);
  return reason ? { reason } : { dateKey };
};

/**
 * "hoje", "amanhã", "sexta", "15/10", "dia 20" → { dateKey } | { reason } | null (não é data).
 * reason: "past" | "too_far" | "closed" | "invalid"
 */
export function parseDate(text, nowMs, barberSchedule = null) {
  const t = normalize(text);
  const today = todayKey(nowMs);

  if (/\bdepois de amanha\b/.test(t)) return validated(addDays(today, 2), nowMs, barberSchedule);
  if (/\bamanha\b/.test(t)) return validated(addDays(today, 1), nowMs, barberSchedule);
  if (/\bhoje\b/.test(t)) return validated(today, nowMs, barberSchedule);

  // dd/mm, dd/mm/aa, dd/mm/aaaa  (ponto fica de fora: "14.30" é horário)
  const dm = t.match(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/);
  if (dm) {
    const day = Number(dm[1]);
    const month = Number(dm[2]);
    const explicitYear = dm[3] ? (dm[3].length === 2 ? 2000 + Number(dm[3]) : Number(dm[3])) : null;
    const year = explicitYear ?? Number(today.slice(0, 4));
    let key = `${year}-${pad2(month)}-${pad2(day)}`;
    if (!isValidDateKey(key)) return { reason: "invalid" };
    // sem ano e já passou há mais de 30 dias → provavelmente é o ano que vem
    if (!explicitYear && key < today && daysBetween(key, today) > 30) key = `${year + 1}-${pad2(month)}-${pad2(day)}`;
    return validated(key, nowMs, barberSchedule);
  }

  // "dia 15" → próxima ocorrência do dia do mês
  const dayOnly = t.match(/\bdia (\d{1,2})\b/);
  if (dayOnly) {
    const day = Number(dayOnly[1]);
    let year = Number(today.slice(0, 4));
    let month = Number(today.slice(5, 7));
    for (let i = 0; i < 14; i += 1) {
      const key = `${year}-${pad2(month)}-${pad2(day)}`;
      if (isValidDateKey(key) && key >= today) return validated(key, nowMs, barberSchedule);
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    return { reason: "invalid" };
  }

  // dia da semana → próxima ocorrência (hoje inclusive)
  const word = t.match(/\b(domingo|segunda|terca|quarta|quinta|sexta|sabado)(?:-feira)?\b/);
  const weekday = word ? WEEKDAY_WORDS[word[1]] : (Object.hasOwn(WEEKDAY_ABBR, t) ? WEEKDAY_ABBR[t] : undefined);
  if (weekday !== undefined) {
    const delta = (weekday - weekdayOf(today) + 7) % 7;
    return validated(addDays(today, delta), nowMs, barberSchedule);
  }
  return null;
}

/* ------------------------- "trocar X" no resumo ------------------------- */

const CHANGE = /\b(?:trocar|mudar|muda|alterar|corrigir|editar|outro|outra)\b.*\b(servico\w*|barbeiro|profissional|data|dia|horario|hora)\b/;

/** @returns {"services"|"barber"|"date"|"time"|null} */
export function parseChangeField(text) {
  const m = normalize(text).match(CHANGE);
  if (!m) return null;
  const word = m[1];
  if (word.startsWith("servico")) return "services";
  if (word === "barbeiro" || word === "profissional") return "barber";
  if (word === "data" || word === "dia") return "date";
  return "time";
}
