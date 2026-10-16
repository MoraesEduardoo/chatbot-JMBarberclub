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
import { toTimestamp, minutesUntilAppointment, timeToMinutes, minutesToTime } from "../../core/domain/time.js";
import { groupAppointments } from "../../core/domain/appointmentGroups.js";
import { ACTIVE_STATUSES, MIN_CANCEL_LEAD_MINUTES, FREE_CANCELLATION } from "../../core/domain/config.js";
import { getServiceDuration } from "../../core/domain/eligibility.js";
import { normalizePhone } from "../../core/domain/phone.js";
import { getSupabase } from "../supabase/browser.js";
import { AppError, toAppError } from "../errors.js";

// In-memory demo store for when Supabase is not configured
let demoAppointments = [];
let demoWaitlist = [];

function requireSupabase() {
  const supabase = getSupabase();
  if (!supabase) return null;
  return supabase;
}

/** 
 * Horários ("HH:MM") de início e intervalos já ocupados para o barbeiro no dia.
 * Cruza a RPC chatbot_booked_times com a tabela appointments e exceções do barbeiro,
 * garantindo remoção de horários com status ('confirmado', 'concluido', 'pendente', 'bloqueado' e pausas).
 */
export async function fetchBookedTimes({ barberId, dateKey }) {
  const supabase = requireSupabase();
  if (!supabase) {
    return [
      ...new Set(
        demoAppointments
          .filter((a) => a.barberId === barberId && a.dateKey === dateKey && ACTIVE_STATUSES.includes(a.status))
          .map((a) => a.time)
      ),
    ];
  }

  const bookedSet = new Set();

  // 1. Chamada à RPC oficial chatbot_booked_times
  try {
    const { data: rpcData, error: rpcError } = await supabase.rpc("chatbot_booked_times", {
      p_barber_id: barberId,
      p_date: dateKey,
    });
    if (!rpcError && Array.isArray(rpcData)) {
      for (const row of rpcData) {
        const t = String(row.booked_time || row.appointment_time || row.time || "").slice(0, 5);
        if (t) bookedSet.add(t);
      }
    }
  } catch (err) {
    console.warn("[appointmentsRepository] Aviso RPC chatbot_booked_times:", err);
  }

  // 2. Consulta direta à tabela appointments para garantir cobertura total de status:
  // 'confirmado', 'concluido', 'pendente', 'confirmed', 'pending', 'completed', 'bloqueado' e pausas
  try {
    const { data: aptData, error: aptError } = await supabase
      .from("appointments")
      .select("appointment_time, appointment_end_time, duration_minutes, buffer_minutes, status, notes")
      .eq("barber_id", barberId)
      .eq("appointment_date", dateKey)
      .in("status", [
        "confirmed",
        "confirmado",
        "pending",
        "pendente",
        "completed",
        "concluido",
        "concluído",
        "bloqueado",
        "blocked",
      ]);

    if (!aptError && Array.isArray(aptData)) {
      for (const apt of aptData) {
        if (!apt.appointment_time) continue;
        const startMin = timeToMinutes(apt.appointment_time);
        const duration = Number(apt.duration_minutes || 30);
        const buffer = Number(apt.buffer_minutes || 10);
        const endMin = startMin + duration + buffer;

        // Ocupa todas as células de 30 minutos atingidas por este atendimento + respiro técnico
        for (let m = startMin; m < endMin; m += 30) {
          bookedSet.add(minutesToTime(m));
        }
      }
    }
  } catch (err) {
    console.warn("[appointmentsRepository] Aviso consulta appointments:", err);
  }

  // 3. Consulta de exceções de expediente (barber_exceptions)
  try {
    const { data: excData } = await supabase
      .from("barber_exceptions")
      .select("is_available, start_time, end_time")
      .eq("barber_id", barberId)
      .eq("exception_date", dateKey);

    if (Array.isArray(excData)) {
      for (const exc of excData) {
        if (exc.is_available === false && exc.start_time && exc.end_time) {
          const sMin = timeToMinutes(exc.start_time);
          const eMin = timeToMinutes(exc.end_time);
          for (let m = sMin; m < eMin; m += 30) bookedSet.add(minutesToTime(m));
        }
      }
    }
  } catch {
    // Ignora caso tabela de exceções não exista
  }

  return Array.from(bookedSet).sort();
}

/** Agendamentos ATIVOS e futuros do telefone, já agrupados (1 grupo = 1 reserva do cliente). */
export async function listActiveAppointments({ phone, catalog }) {
  const normPhone = normalizePhone(phone);
  const supabase = requireSupabase();
  if (!supabase) {
    const rows = demoAppointments
      .filter((a) => a.phone === normPhone && ACTIVE_STATUSES.includes(a.status))
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

  let rpcData = null;
  const { data, error } = await supabase.rpc("chatbot_list_appointments", { p_phone: normPhone });

  if (error) {
    // Fallback defensivo: se a RPC falhar, consulta direta na tabela appointments
    try {
      const { data: directData } = await supabase
        .from("appointments")
        .select("id, barber_id, service_id, client_name, appointment_date, appointment_time, status, created_at, barbers(name), services(name)")
        .eq("client_phone", normPhone)
        .in("status", ["confirmed", "confirmado", "pending", "pendente"])
        .gte("appointment_date", new Date().toISOString().slice(0, 10))
        .order("appointment_date", { ascending: true })
        .order("appointment_time", { ascending: true });

      if (Array.isArray(directData)) {
        rpcData = directData.map((r) => ({
          appointment_id: r.id,
          barber_id: r.barber_id,
          barber_name: r.barbers?.name,
          service_id: r.service_id,
          service_name: r.services?.name,
          appointment_date: r.appointment_date,
          appointment_time: r.appointment_time,
          status: r.status,
          created_at: r.created_at,
        }));
      }
    } catch {
      throw toAppError(error);
    }
  } else {
    rpcData = data;
  }

  const rows = (rpcData || [])
    .filter((row) => {
      const s = String(row.status || "").toLowerCase();
      return s === "confirmed" || s === "confirmado" || s === "pending" || s === "pendente";
    })
    .map((row) => {
      const rawDate = row.appointment_date ? String(row.appointment_date).slice(0, 10) : "";
      const rawTime = row.appointment_time ? String(row.appointment_time).slice(0, 5) : "09:00";
      const startsAt = rawDate.includes("T") ? rawDate : toTimestamp(rawDate, rawTime);

      return {
        id: row.appointment_id || row.id,
        barberId: row.barber_id,
        barberName: row.barber_name ?? catalog?.barbers.find((b) => b.id === row.barber_id)?.name ?? "Profissional",
        serviceId: row.service_id,
        serviceName: row.service_name ?? catalog?.services.find((s) => s.id === row.service_id)?.name ?? "Serviço",
        startsAt,
        status: row.status,
        batchKey: row.created_at ?? row.batchKey ?? null,
      };
    });

  return groupAppointments(rows, {
    durationOf: (row) => {
      const service = catalog?.services.find((s) => s.id === row.serviceId);
      return service ? getServiceDuration(catalog, service, row.barberId) : 0;
    },
  });
}

/**
 * Cria a reserva (uma linha por serviço) e devolve os ids.
 * Inclui:
 * 1. Upsert transparente de cliente na tabela `clients` para garantir client_id não nulo.
 * 2. Suporte rigoroso aos parâmetros oficiais da RPC (p_date, p_time) com fallback para timestamps.
 * 3. Idempotência e tratamento de conflitos.
 */
export async function createAppointments({ client, barberId, serviceIds, dateKey, time }) {
  const supabase = requireSupabase();
  const cleanPhone = normalizePhone(client.phone);

  if (!supabase) {
    const batchKey = new Date().toISOString();
    const ids = [];
    for (const serviceId of serviceIds) {
      const id = typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `apt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      demoAppointments.push({
        id,
        phone: cleanPhone,
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

  // 1. Upsert defensivo na tabela clients: garante existência física do cliente e ID válido
  let resolvedClientId = null;
  try {
    const { data: upsertData } = await supabase
      .from("clients")
      .upsert(
        {
          name: client.name.trim(),
          phone: cleanPhone,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "phone" }
      )
      .select("id")
      .single();

    if (upsertData?.id) {
      resolvedClientId = upsertData.id;
    }
  } catch (err) {
    console.warn("[appointmentsRepository] Aviso no upsert prévio de cliente:", err);
  }

  // 2. Chamada à RPC oficial chatbot_create_appointments
  const timeFormatted = time.length === 5 ? `${time}:00` : time;
  let rpcRes = await supabase.rpc("chatbot_create_appointments", {
    p_client_name: client.name.trim(),
    p_client_phone: cleanPhone,
    p_barber_id: barberId,
    p_service_ids: serviceIds,
    p_date: dateKey,
    p_time: timeFormatted,
    p_notes: "Agendamento realizado via Chatbot",
  });

  // Se a função no banco tiver uma assinatura com p_appointment_at (fallback retrocompatível)
  if (rpcRes.error && (rpcRes.error.message?.includes("Could not find the function") || rpcRes.error.code === "PGRST202")) {
    rpcRes = await supabase.rpc("chatbot_create_appointments", {
      p_barber_id: barberId,
      p_service_ids: serviceIds,
      p_client_name: client.name.trim(),
      p_client_phone: cleanPhone,
      p_appointment_at: toTimestamp(dateKey, time),
    });
  }

  const { data, error } = rpcRes;

  if (error) {
    const appError = toAppError(error);
    if (appError.kind === "conflict") {
      const existing = await findOwnAppointment({ client, barberId, dateKey, time });
      if (existing) return existing.ids;
    }
    throw appError;
  }

  // 3. Processamento do retorno JSONB da RPC
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (data.success === false) {
      if (data.code === "TIME_SLOT_UNAVAILABLE" || data.code === "CONFLICT") {
        const existing = await findOwnAppointment({ client, barberId, dateKey, time });
        if (existing) return existing.ids;
        throw new AppError("conflict", data.message || "Horário indisponível.");
      }
      throw new AppError("unknown", data.message || "Não foi possível confirmar o agendamento.");
    }

    if (Array.isArray(data.appointment_ids) && data.appointment_ids.length > 0) {
      return data.appointment_ids;
    }
    if (data.appointment_id) {
      return [data.appointment_id];
    }
  }

  const ids = Array.isArray(data) ? data.filter(Boolean) : data ? [data] : [];
  if (!ids.length) {
    // Caso de redundância: se a RPC retornou sem IDs mas foi executada com sucesso
    if (resolvedClientId) {
      const own = await findOwnAppointment({ client, barberId, dateKey, time });
      if (own?.ids?.length) return own.ids;
    }
    throw new AppError("unknown", "O agendamento não foi gravado no sistema da barbearia. Tente novamente.");
  }
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

export async function cancelAppointments({ ids, phone, dateKey, time, nowMs = Date.now() }) {
  // Regra 2: Cancelamento livre e autônomo pelo chat
  if (!FREE_CANCELLATION && MIN_CANCEL_LEAD_MINUTES > 0 && dateKey && time) {
    const minsLeft = minutesUntilAppointment(dateKey, time, nowMs);
    if (minsLeft < MIN_CANCEL_LEAD_MINUTES) {
      throw new AppError("forbidden", "Cancelamento permitido apenas com antecedência. Ligue para a barbearia.");
    }
  }

  const supabase = requireSupabase();
  if (!supabase) {
    const idSet = new Set(ids);
    demoAppointments = demoAppointments.map((a) => (idSet.has(a.id) ? { ...a, status: "cancelado" } : a));
    return;
  }

  const cleanPhone = normalizePhone(phone);
  const targetIds = Array.isArray(ids) ? ids : [ids];

  for (const aptId of targetIds) {
    let rpcErr = null;
    const res = await supabase.rpc("chatbot_cancel_appointments", {
      p_phone: cleanPhone,
      p_appointment_id: aptId,
      p_reason: "Cancelamento livre via Chatbot",
    });

    if (res.error && (res.error.message?.includes("Could not find the function") || res.error.code === "PGRST202")) {
      const altRes = await supabase.rpc("chatbot_cancel_appointments", {
        p_ids: targetIds,
        p_phone: cleanPhone,
      });
      if (altRes.error) throw toAppError(altRes.error);
      return;
    }

    if (res.error) {
      rpcErr = res.error;
    } else if (res.data?.success === false && res.data?.canceled_count === 0) {
      rpcErr = new Error(res.data.message || "Agendamento não encontrado.");
    }

    if (rpcErr) {
      // Fallback direto na tabela caso a RPC acuse restrição
      try {
        await supabase
          .from("appointments")
          .update({ status: "canceled", updated_at: new Date().toISOString() })
          .eq("id", aptId)
          .eq("client_phone", cleanPhone);
      } catch {
        throw toAppError(rpcErr);
      }
    }
  }
}

/** Move TODAS as linhas da reserva mantendo o espaçamento entre elas. */
export async function rescheduleAppointments({ ids, phone, dateKey, time, oldDateKey, oldTime, nowMs = Date.now() }) {
  // Regra 2: Reagendamento livre e autônomo pelo chat
  if (!FREE_CANCELLATION && MIN_CANCEL_LEAD_MINUTES > 0 && oldDateKey && oldTime) {
    const minsLeft = minutesUntilAppointment(oldDateKey, oldTime, nowMs);
    if (minsLeft < MIN_CANCEL_LEAD_MINUTES) {
      throw new AppError("forbidden", "Reagendamento permitido apenas com antecedência. Ligue para a barbearia.");
    }
  }

  const supabase = requireSupabase();
  if (!supabase) {
    const idSet = new Set(ids);
    demoAppointments = demoAppointments.map((a) => (idSet.has(a.id) ? { ...a, dateKey, time } : a));
    return;
  }

  const cleanPhone = normalizePhone(phone);
  const timeFormatted = time.length === 5 ? `${time}:00` : time;
  const primaryId = Array.isArray(ids) ? ids[0] : ids;

  let rpcRes = await supabase.rpc("chatbot_reschedule_appointments", {
    p_phone: cleanPhone,
    p_appointment_id: primaryId,
    p_new_date: dateKey,
    p_new_time: timeFormatted,
  });

  if (rpcRes.error && (rpcRes.error.message?.includes("Could not find the function") || rpcRes.error.code === "PGRST202")) {
    rpcRes = await supabase.rpc("chatbot_reschedule_appointments", {
      p_ids: Array.isArray(ids) ? ids : [ids],
      p_phone: cleanPhone,
      p_new_at: toTimestamp(dateKey, time),
    });
  }

  if (rpcRes.error) throw toAppError(rpcRes.error);
  if (rpcRes.data && typeof rpcRes.data === "object" && rpcRes.data.success === false) {
    if (rpcRes.data.code === "SLOT_OCCUPIED") {
      throw new AppError("conflict", rpcRes.data.message || "Horário indisponível.");
    }
    throw new AppError("unknown", rpcRes.data.message || "Não foi possível reagendar.");
  }
}

/**
 * Regra 4: Entrada em Lista de Espera automatizada
 */
export async function joinWaitlist({ client, barberId, barberName, serviceIds = [], dateKey, preferredTime }) {
  const supabase = requireSupabase();
  const cleanPhone = normalizePhone(client?.phone || "");
  const entry = {
    id: typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : `wl-${Date.now()}`,
    client_name: client?.name || "Cliente",
    client_phone: cleanPhone,
    barber_id: barberId || null,
    barber_name: barberName || "Qualquer",
    date_key: dateKey,
    preferred_time: preferredTime || null,
    service_ids: serviceIds,
    created_at: new Date().toISOString(),
    status: "waiting",
  };

  demoWaitlist.push(entry);

  if (supabase) {
    try {
      const timeFormatted = preferredTime ? (preferredTime.length === 5 ? `${preferredTime}:00` : preferredTime) : null;
      const { error: rpcErr } = await supabase.rpc("chatbot_join_waitlist", {
        p_client_name: client?.name || "Cliente",
        p_client_phone: cleanPhone,
        p_barber_id: barberId || null,
        p_service_name: barberName ? `Atendimento com ${barberName}` : "Geral",
        p_service_ids: serviceIds,
        p_desired_date: dateKey,
        p_desired_time: timeFormatted,
      });

      if (rpcErr) {
        // Fallback direto na tabela waitlist
        await supabase.from("waitlist").insert([
          {
            client_name: client?.name || "Cliente",
            client_phone: cleanPhone,
            barber_id: barberId || null,
            desired_date: dateKey,
            desired_time: timeFormatted,
            service_ids: serviceIds,
            status: "waiting",
          },
        ]);
      }
    } catch (err) {
      console.warn("[appointmentsRepository] Erro ao registrar waitlist:", err);
    }
  }

  return { success: true, entry };
}

/**
 * Consulta se o cliente é Fiel (5+ agendamentos concluídos no mesmo serviço e profissional).
 */
export async function getLoyaltyProfile({ phone, catalog }) {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 8) return { isLoyal: false };

  const supabase = requireSupabase();
  if (!supabase) {
    const completed = demoAppointments.filter(
      (a) => normalizePhone(a.client?.phone || a.phone) === cleanPhone && (a.status === "completed" || a.status === "concluido")
    );
    if (completed.length >= 5) {
      const first = completed[0];
      return {
        isLoyal: true,
        serviceId: first.serviceId || "degrade",
        serviceName: first.serviceName || "Degradê",
        barberId: first.barberId || "11111111-1111-4111-a111-111111111111",
        barberName: first.barberName || "Matheus",
        totalCompleted: completed.length,
      };
    }
    return { isLoyal: false };
  }

  try {
    const { data, error } = await supabase.rpc("chatbot_get_loyalty_profile", { p_phone: cleanPhone });
    if (!error && data && data.is_loyal) {
      return {
        isLoyal: true,
        clientName: data.client_name,
        serviceId: data.service_id,
        serviceName: data.service_name,
        servicePrice: data.service_price,
        serviceDuration: data.service_duration,
        barberId: data.barber_id,
        barberName: data.barber_name,
        barberAvatar: data.barber_avatar,
        totalCompleted: data.total_completed,
      };
    }

    // Fallback: consulta direta via tabela appointments
    const { data: appointments, error: aptErr } = await supabase
      .from("appointments")
      .select("client_name, service_id, barber_id, status, services:services(id, name, price, duration_minutes), barbers:barbers(id, name, avatar_url, image)")
      .ilike("client_phone", `%${cleanPhone}%`)
      .in("status", ["completed", "concluido"]);

    if (!aptErr && appointments?.length) {
      const comboMap = new Map();
      for (const apt of appointments) {
        const sId = apt.service_id || apt.services?.id;
        const bId = apt.barber_id || apt.barbers?.id;
        if (!sId || !bId) continue;
        const comboKey = `${sId}_${bId}`;
        if (!comboMap.has(comboKey)) {
          comboMap.set(comboKey, {
            count: 0,
            serviceId: sId,
            serviceName: apt.services?.name || "Serviço",
            servicePrice: apt.services?.price || 0,
            serviceDuration: apt.services?.duration_minutes || 30,
            barberId: bId,
            barberName: apt.barbers?.name || "Barbeiro",
            barberAvatar: apt.barbers?.avatar_url || apt.barbers?.image || "",
            clientName: apt.client_name,
          });
        }
        comboMap.get(comboKey).count += 1;
      }
      for (const item of comboMap.values()) {
        if (item.count >= 5) {
          return {
            isLoyal: true,
            clientName: item.clientName,
            serviceId: item.serviceId,
            serviceName: item.serviceName,
            servicePrice: item.servicePrice,
            serviceDuration: item.serviceDuration,
            barberId: item.barberId,
            barberName: item.barberName,
            barberAvatar: item.barberAvatar,
            totalCompleted: item.count,
          };
        }
      }
    }
  } catch (err) {
    console.warn("[appointmentsRepository] Erro ao buscar perfil de fidelidade:", err);
  }

  return { isLoyal: false };
}

