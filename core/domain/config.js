/**
 * Configuração de negócio da barbearia — ÚNICO lugar para ajustar horários,
 * regras de agenda e dados de contato. Nada aqui depende de React ou Supabase.
 */

export const SHOP = Object.freeze({
  name: "JM Barberclub",
  /** Número no formato que o cliente digitaria (com DDD). Vazio = esconde o link de WhatsApp. */
  whatsapp: process.env.NEXT_PUBLIC_SHOP_WHATSAPP || "",
  /** Campina Grande / Paraíba não tem horário de verão: offset fixo -03:00. */
  timezone: "America/Fortaleza",
  utcOffset: "-03:00",
});

/** Granularidade da grade de horários (minutos). */
export const SLOT_MINUTES = 30;
/** Antecedência mínima para aceitar um horário no dia de hoje (0 = qualquer horário futuro). */
export const MIN_LEAD_MINUTES = 0;
/** Quantos dias à frente o cliente pode agendar. */
export const BOOKING_WINDOW_DAYS = 180;

/** Horário de funcionamento por dia da semana (0 = domingo … 6 = sábado). */
export const BUSINESS_HOURS = Object.freeze({
  0: { start: "09:00", end: "12:30" },
  1: { start: "14:30", end: "19:00" },
  2: { start: "09:00", end: "19:00" },
  3: { start: "09:00", end: "19:00" },
  4: { start: "09:00", end: "19:00" },
  5: { start: "09:00", end: "19:00" },
  6: { start: "09:00", end: "19:00" },
});

/** Valores da coluna appointments.status usados pelo chat. */
export const STATUS = Object.freeze({
  PENDING: "pendente",
  CONFIRMED: "confirmado",
  CANCELLED: "cancelado",
});
export const ACTIVE_STATUSES = Object.freeze([STATUS.PENDING, STATUS.CONFIRMED]);

/**
 * Como agrupar linhas de `appointments` que pertencem à MESMA reserva
 * (a RPC grava uma linha por serviço). Linhas do mesmo barbeiro cujo início
 * cai até `toleranceMinutes` depois do fim da linha anterior formam um grupo.
 * Se a sua RPC espaça as linhas de forma diferente, ajuste aqui.
 */
export const APPOINTMENT_GROUPING = Object.freeze({ toleranceMinutes: 0 });

/** Serviços que, sem vínculo em `barber_services`, só o William executa (fallback). */
export const RESTRICTED_SERVICE_NAMES = Object.freeze(["Sobrancelha na linha", "Corte Freestyle"]);
export const RESTRICTED_BARBER_NAME = "william";

/* -------------------------------------------------------------------------
 * Catálogo local — usado apenas quando o Supabase não está configurado
 * (desenvolvimento/demonstração). Com Supabase, os dados vêm das tabelas.
 * ---------------------------------------------------------------------- */
const svc = (id, name, price, restricted = false) => ({
  id, name, price, durationMinutes: 0, image: "", restricted,
});

export const FALLBACK_SERVICES = Object.freeze([
  svc("degrade", "Degradê", 25),
  svc("tesoura", "Corte Só Tesoura", 25),
  svc("lowfade-americano", "Lowfade ou Americano", 25),
  svc("barboterapia", "Barboterapia", 20),
  svc("corte-barboterapia", "Corte e Barboterapia", 40),
  svc("corte-barba", "Corte + Barba Simples", 35),
  svc("barba", "Barba (Cavanhaque ou Design Simples)", 15),
  svc("degrade-sobrancelha", "Degradê + Sobrancelha", 30),
  svc("social-sobrancelha", "Social + Sobrancelha", 25),
  svc("corte-social", "Corte Simples ou Social", 20),
  svc("limpeza-pele", "Limpeza de Pele", 15),
  svc("sobrancelha-linha", "Sobrancelha na linha", 15, true),
  svc("freestyle", "Corte Freestyle", 15, true),
]);

export const FALLBACK_BARBERS = Object.freeze([
  {
    id: "b949db29-efb1-4131-8234-873195068328",
    name: "Matheus",
    image: "",
    // Escala do painel administrativo (image_1e8042.png): Matheus está FECHADO na segunda-feira
    schedules: {
      0: { is_working: false, closed: true },
      1: { is_working: false, closed: true }, // Segunda-feira: FECHADO / Folga
      2: { is_working: true, closed: false, start: "09:00", end: "19:00" },
      3: { is_working: true, closed: false, start: "09:00", end: "19:00" },
      4: { is_working: true, closed: false, start: "09:00", end: "19:00" },
      5: { is_working: true, closed: false, start: "09:00", end: "19:00" },
      6: { is_working: true, closed: false, start: "09:00", end: "19:00" },
    },
  },
  {
    id: "9ebcd15c-b747-4d0b-b12f-5de9465363f9",
    name: "William",
    image: "",
    schedules: {
      0: { is_working: true, closed: false, start: "09:00", end: "12:30" },
      1: { is_working: true, closed: false, start: "14:30", end: "19:00" },
      2: { is_working: true, closed: false, start: "09:00", end: "19:00" },
      3: { is_working: true, closed: false, start: "09:00", end: "19:00" },
      4: { is_working: true, closed: false, start: "09:00", end: "19:00" },
      5: { is_working: true, closed: false, start: "09:00", end: "19:00" },
      6: { is_working: true, closed: false, start: "09:00", end: "19:00" },
    },
  },
]);
