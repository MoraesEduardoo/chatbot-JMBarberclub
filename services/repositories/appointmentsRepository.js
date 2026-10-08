/**
 * TODA escrita/leitura de agendamentos passa por RPCs (SECURITY DEFINER) — o chat
 * nunca faz SELECT/INSERT/UPDATE direto na tabela `appointments`. Isso permite deixar
 * o RLS fechado para a chave anônima e evita vazar dados de outros clientes.
 *
 * RPCs usadas:
 *   chatbot_booked_times(p_barber_id, p_date)                                  [já existia]
 *   chatbot_create_appointments(p_barber_id, p_service_ids, p_client_name, …)  [já existia — 010]
 *   chatbot_list_appointments(p_phone)                                         [NOVA — 011]
 *   chatbot_cancel_appointments(p_ids, p_phone)                                [NOVA — 011]
 *   chatbot_reschedule_appointments(p_ids, p_phone, p_new_at)                  [NOVA — 011]
 */
import { toTimestamp } from "../../core/domain/time.js";
import { groupAppointments } from "../../core/domain/appointmentGroups.js";
import { ACTIVE_STATUSES } from "../../core/domain/config.js";
import { getServiceDuration } from "../../core/domain/eligibility.js";
import { normalizePhone } from "../../core/domain/phone.js";
import { getSupabase } from "../supabase/browser.js";
import { AppError, toAppError } from "../errors.js";

// In-memory demo store for when Supabase is not configured
let demoAppointments = [];

function requireSupabase() {
  const supabase = getSupabase();
  if (!supabase) return null;
  return supabase;
}

/** Horários ("HH:MM") de início já ocupados para o barbeiro no dia. */
export async function fetchBookedTimes({ barberId, dateKey }) {
  const supabase = requireSupabase();
  if (!supabase) {
    return demoAppointments
      .filter((a) => a.barberId === barberId && a.dateKey === dateKey && ACTIVE_STATUSES.includes(a.status))
      .map((a) => a.time);
  }
  const { data, error } = await supabase.rpc("chatbot_booked_times", { p_barber_id: barberId, p_date: dateKey });
  if (error) throw toAppError(error);
  return [...new Set((data || []).map((row) => String(row.appointment_time).slice(0, 5)))];
}

/** Agendamentos ATIVOS e futuros do telefone, já agrupados (1 grupo = 1 reserva do cliente). */
export async function listActiveAppointments({ phone, catalog }) {
  const supabase = requireSupabase();
  if (!supabase) {
    const norm = normalizePhone(phone);
    const rows = demoAppointments
      .filter((a) => a.phone === norm && ACTIVE_STATUSES.includes(a.status))
      .map((a) => ({
        id: a.id,
        barberId: a.barberId,
        barberName: a.barberName ?? catalog?.barbers.find((b) => b.id === a.barberId)?.name ?? "Profissional",
        serviceId: a.serviceId,
        serviceName: a.serviceName ?? catalog?.services.find((s) => s.id === a.serviceId)?.name ?? "Serviço",
        startsAt: toTimestamp(a.dateKey, a.time),
        status: a.status,
        batchKey: a.batchKey ?? null,
      }));

    return groupAppointments(rows, {
      durationOf: (row) => {
        const service = catalog?.services.find((s) => s.id === row.serviceId);
        return service ? getServiceDuration(catalog, service, row.barberId) : 0;
      },
    });
  }

  const { data, error } = await supabase.rpc("chatbot_list_appointments", { p_phone: normalizePhone(phone) });
  if (error) throw toAppError(error);

  const rows = (data || [])
    .filter((row) => ACTIVE_STATUSES.includes(row.status))
    .map((row) => ({
      id: row.id,
      barberId: row.barber_id,
      barberName: row.barber_name ?? catalog?.barbers.find((b) => b.id === row.barber_id)?.name ?? "Profissional",
      serviceId: row.service_id,
      serviceName: row.service_name ?? catalog?.services.find((s) => s.id === row.service_id)?.name ?? "Serviço",
      startsAt: row.appointment_date,
      status: row.status,
      batchKey: row.created_at ?? null,
    }));

  return groupAppointments(rows, {
    durationOf: (row) => {
      const service = catalog?.services.find((s) => s.id === row.serviceId);
      return service ? getServiceDuration(catalog, service, row.barberId) : 0;
    },
  });
}

/**
 * Cria a reserva (uma linha por serviço) e devolve os ids.
 * Idempotente: se a RPC acusar conflito (23505/409) mas a reserva JÁ É do mesmo cliente
 * (a 1ª resposta se perdeu na rede e ele reenviou), devolve os ids existentes em vez de erro.
 */
export async function createAppointments({ client, barberId, serviceIds, dateKey, time }) {
  const supabase = requireSupabase();
  if (!supabase) {
    const batchKey = new Date().toISOString();
    const ids = [];
    for (const serviceId of serviceIds) {
      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `apt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      demoAppointments.push({
        id,
        phone: normalizePhone(client.phone),
        clientName: client.name,
        barberId,
        serviceId,
        dateKey,
        time,
        status: "confirmado",
        batchKey,
      });
      ids.push(id);
    }
    return ids;
  }

  const { data, error } = await supabase.rpc("chatbot_create_appointments", {
    p_barber_id: barberId,
    p_service_ids: serviceIds,
    p_client_name: client.name,
    p_client_phone: normalizePhone(client.phone),
    p_appointment_at: toTimestamp(dateKey, time),
  });

  if (error) {
    const appError = toAppError(error);
    if (appError.kind === "conflict") {
      const existing = await findOwnAppointment({ client, barberId, dateKey, time });
      if (existing) return existing.ids;
    }
    throw appError;
  }

  // A RPC devolve os ids criados. Vazio = nada gravado: falhar é melhor que "confirmar" sem registro.
  const ids = Array.isArray(data) ? data.filter(Boolean) : data ? [data] : [];
  if (!ids.length) throw new AppError("unknown", "O agendamento não foi gravado no sistema da barbearia. Tente novamente.");
  return ids;
}

async function findOwnAppointment({ client, barberId, dateKey, time }) {
  try {
    const groups = await listActiveAppointments({ phone: client.phone });
    return groups.find((g) => g.barberId === barberId && g.dateKey === dateKey && g.time === time) ?? null;
  } catch {
    return null;
  }
}

export async function cancelAppointments({ ids, phone }) {
  const supabase = requireSupabase();
  if (!supabase) {
    const idSet = new Set(ids);
    demoAppointments = demoAppointments.map((a) => (idSet.has(a.id) ? { ...a, status: "cancelado" } : a));
    return;
  }
  const { error } = await supabase.rpc("chatbot_cancel_appointments", { p_ids: ids, p_phone: normalizePhone(phone) });
  if (error) throw toAppError(error);
}

/** Move TODAS as linhas da reserva mantendo o espaçamento entre elas (a RPC aplica o mesmo deslocamento). */
export async function rescheduleAppointments({ ids, phone, dateKey, time }) {
  const supabase = requireSupabase();
  if (!supabase) {
    const idSet = new Set(ids);
    demoAppointments = demoAppointments.map((a) => (idSet.has(a.id) ? { ...a, dateKey, time } : a));
    return;
  }
  const { error } = await supabase.rpc("chatbot_reschedule_appointments", {
    p_ids: ids,
    p_phone: normalizePhone(phone),
    p_new_at: toTimestamp(dateKey, time),
  });
  if (error) throw toAppError(error);
}
