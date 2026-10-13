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

/** Regra 1: Antecedência mínima para agendar horário hoje (30 minutos à frente do horário atual). */
export const MIN_LEAD_MINUTES = 30;

/** Regra 1: Antecedência máxima permitida no calendário (no máximo 30 dias no futuro). */
export const BOOKING_WINDOW_DAYS = 30;

/** Regra 2: Janela mínima para cancelamento ou reagendamento autônomo pelo chat (120 minutos = 2 horas). */
export const MIN_CANCEL_LEAD_MINUTES = 120;

/** Regra 3: Intervalo de limpeza e respiro técnico automático pós-atendimento (10 minutos). */
export const CLEANING_BUFFER_MINUTES = 10;

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
const svc = (id, name, price, durationMinutes = 30, restricted = false) => ({
  id, name, price, durationMinutes, image: "", restricted,
});

export const FALLBACK_SERVICES = Object.freeze([
  svc("degrade", "Degradê", 25, 30),
  svc("tesoura", "Corte Só Tesoura", 25, 30),
  svc("lowfade-americano", "Lowfade ou Americano", 25, 30),
  svc("barboterapia", "Barboterapia", 20, 30),
  svc("corte-barboterapia", "Corte e Barboterapia", 40, 60),
  svc("corte-barba", "Corte + Barba Simples", 35, 50),
  svc("barba", "Barba (Cavanhaque ou Design Simples)", 15, 20),
  svc("degrade-sobrancelha", "Degradê + Sobrancelha", 30, 40),
  svc("social-sobrancelha", "Social + Sobrancelha", 25, 35),
  svc("corte-social", "Corte Simples ou Social", 20, 30),
  svc("limpeza-pele", "Limpeza de Pele", 15, 30),
  svc("sobrancelha-linha", "Sobrancelha na linha", 15, 15, true),
  svc("freestyle", "Corte Freestyle", 15, 30, true),
]);

export const FALLBACK_BARBERS = Object.freeze([
  { id: "b949db29-efb1-4131-8234-873195068328", name: "Matheus", image: "" },
  { id: "9ebcd15c-b747-4d0b-b12f-5de9465363f9", name: "William", image: "" },
]);
