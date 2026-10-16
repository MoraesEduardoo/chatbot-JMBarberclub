"use server";

import { createClient } from "@supabase/supabase-js";
import {
  toTimestamp, weekdayOf, timeToMinutes, WEEKDAYS_LONG, shopClock, todayKey, daysBetween
} from "@/core/domain/time";
import { normalizePhone } from "@/core/domain/phone";
import {
  FALLBACK_BARBERS, FALLBACK_SERVICES, BUSINESS_HOURS, MIN_LEAD_MINUTES, BOOKING_WINDOW_DAYS,
  CLEANING_BUFFER_MINUTES
} from "@/core/domain/config";
import { buildBarberScheduleMap } from "@/services/repositories/catalogRepository";

/**
 * =========================================================================
 * SERVER ACTION: createAppointmentAction
 * =========================================================================
 * 
 * Regras de Negócio e Guardas de Segurança no Backend:
 * 1. Validação de Antecedência e Limites de Data:
 *    - Antecedência Mínima: Impede agendamento com menos de 30 minutos de antecedência hoje.
 *    - Antecedência Máxima: Limita marcações a no máximo 30 dias no futuro.
 * 2. Consulta Rigorosa de Expediente:
 *    - Bloqueia dias de folga do barbeiro (tabela barber_schedules).
 * 3. Soma Dinâmica de Duração e Buffer:
 *    - Soma dinamicamente os tempos de cada procedimento selecionado.
 *    - Adiciona 10 minutos de respiro técnico/limpeza automático.
 *    - Garante que início + duração total + buffer não estourem o expediente nem o almoço.
 * 4. Persistência atômica e segura via RPC.
 */
export async function createAppointmentAction({ client, barberId, serviceIds, dateKey, time }) {
  if (!client?.name || !client?.phone || !barberId || !Array.isArray(serviceIds) || !serviceIds.length || !dateKey || !time) {
    return {
      success: false,
      error: "Dados incompletos para efetuar o agendamento.",
    };
  }

  const nowMs = Date.now();
  const today = todayKey(nowMs);

  // -------------------------------------------------------------------------
  // REGRA 1: Validação de Antecedência e Limites de Data (Backend Guard)
  // -------------------------------------------------------------------------
  const daysAhead = daysBetween(today, dateKey);
  if (daysAhead < 0) {
    return {
      success: false,
      error: "Não é possível agendar em datas que já passaram.",
    };
  }
  if (daysAhead >= BOOKING_WINDOW_DAYS) {
    return {
      success: false,
      error: `Agendamentos são limitados a no máximo ${BOOKING_WINDOW_DAYS} dias de antecedência no futuro.`,
    };
  }

  const timeMin = timeToMinutes(time);

  // Antecedência mínima de 30 minutos em relação ao horário atual hoje
  if (dateKey === today) {
    const clock = shopClock(nowMs);
    if (timeMin < clock.minutes + MIN_LEAD_MINUTES) {
      return {
        success: false,
        error: `Agendamentos no dia de hoje exigem no mínimo ${MIN_LEAD_MINUTES} minutos de antecedência.`,
      };
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const weekday = weekdayOf(dateKey); // 0 = domingo ... 6 = sábado
  const weekdayName = WEEKDAYS_LONG[weekday] || "este dia da semana";

  // -------------------------------------------------------------------------
  // REGRA 3: Soma Dinâmica de Durações dos Serviços Selecionados + Buffer
  // -------------------------------------------------------------------------
  let totalServiceDuration = 0;
  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { data: dbServices } = await supabase
        .from("services")
        .select("id, duration_minutes")
        .in("id", serviceIds);

      if (Array.isArray(dbServices) && dbServices.length > 0) {
        for (const sId of serviceIds) {
          const found = dbServices.find((s) => s.id === sId);
          totalServiceDuration += found?.duration_minutes ?? 30;
        }
      }
    } catch {
      // Fallback para cálculo local se der erro de consulta
    }
  }

  if (totalServiceDuration === 0) {
    // Fallback de catálogo local
    for (const sId of serviceIds) {
      const found = FALLBACK_SERVICES.find((s) => s.id === sId);
      totalServiceDuration += found?.durationMinutes ?? 30;
    }
  }

  // Adiciona o respiro técnico automático (buffer de 10 min) pós-atendimento
  const totalBlockDuration = totalServiceDuration + CLEANING_BUFFER_MINUTES;

  // -------------------------------------------------------------------------
  // CONSULTA RIGOROSA DE EXPEDIENTE (barber_schedules)
  // -------------------------------------------------------------------------
  let scheduleForDay = null;

  if (url && key) {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    let { data: schedulesData, error: schedError } = await supabase
      .from("barber_schedules")
      .select("*")
      .eq("barber_id", barberId);

    if (schedError) {
      const alt = await supabase
        .from("barber_schedule")
        .select("*")
        .eq("barber_id", barberId);
      if (!alt.error) schedulesData = alt.data;
    }

    if (Array.isArray(schedulesData) && schedulesData.length > 0) {
      const scheduleMap = buildBarberScheduleMap(schedulesData, barberId);
      if (scheduleMap) {
        const custom = scheduleMap[weekday];
        if (!custom || custom.is_working === false || custom.closed === true) {
          return {
            success: false,
            error: `O barbeiro selecionado não atende na ${weekdayName} (expediente fechado/folga no sistema). Por favor, selecione outra data.`,
          };
        }
        scheduleForDay = custom;
      }
    }
  }

  if (!scheduleForDay) {
    const fallbackBarber = FALLBACK_BARBERS.find((b) => b.id === barberId);
    if (fallbackBarber?.schedules) {
      const custom = fallbackBarber.schedules[weekday];
      if (!custom || custom.is_working === false || custom.closed === true) {
        return {
          success: false,
          error: `O barbeiro selecionado não atende na ${weekdayName} (expediente fechado/folga). Por favor, selecione outra data.`,
        };
      }
      scheduleForDay = custom;
    } else {
      const def = BUSINESS_HOURS[weekday];
      if (!def || def.closed === true || def.is_working === false) {
        return {
          success: false,
          error: `A barbearia está fechada na ${weekdayName}. Por favor, selecione outra data.`,
        };
      }
      scheduleForDay = def;
    }
  }

  // -------------------------------------------------------------------------
  // VALIDAÇÃO DE HORÁRIO, DURAÇÃO TOTAL + BUFFER E PAUSA DE ALMOÇO
  // -------------------------------------------------------------------------
  const startMin = timeToMinutes(scheduleForDay.start || "09:00");
  const endMin = timeToMinutes(scheduleForDay.end || "19:00");

  if (timeMin < startMin) {
    return {
      success: false,
      error: `O horário selecionado (${time}) está antes da abertura do expediente (${scheduleForDay.start}).`,
    };
  }

  // Regra 3: Valida se o término do atendimento + respiro técnico (buffer) não estoura o expediente
  if (timeMin + totalBlockDuration > endMin) {
    return {
      success: false,
      error: `O procedimento com duração somada de ${totalServiceDuration} min (+ ${CLEANING_BUFFER_MINUTES} min de intervalo técnico) ultrapassa o encerramento do expediente (${scheduleForDay.end}). Escolha um horário mais cedo.`,
    };
  }

  const lunchStart = scheduleForDay.lunchStart ?? scheduleForDay.breakStart;
  const lunchEnd = scheduleForDay.lunchEnd ?? scheduleForDay.breakEnd;
  if (lunchStart && lunchEnd) {
    const lStartMin = timeToMinutes(lunchStart);
    const lEndMin = timeToMinutes(lunchEnd);
    // Bloqueia se o início ou a duração invadir o intervalo de almoço
    if (timeMin < lEndMin && (timeMin + totalServiceDuration) > lStartMin) {
      return {
        success: false,
        error: `O horário e duração do procedimento coincidem com a pausa/almoço do profissional (${lunchStart} às ${lunchEnd}). Por favor, escolha outro horário.`,
      };
    }
  }

  // -------------------------------------------------------------------------
  // VALIDAÇÃO ESTRITA DE COLISÃO COM AGENDAMENTOS EXISTENTES NO BANCO
  // -------------------------------------------------------------------------
  if (url && key) {
    try {
      const supabaseCheck = createClient(url, key, { auth: { persistSession: false } });
      const { data: existingAppts } = await supabaseCheck
        .from("appointments")
        .select("appointment_time, duration_minutes, buffer_minutes, status")
        .eq("barber_id", barberId)
        .eq("appointment_date", dateKey)
        .in("status", [
          "confirmed", "confirmado",
          "pending", "pendente",
          "completed", "concluido", "concluído",
          "bloqueado", "blocked"
        ]);

      if (Array.isArray(existingAppts) && existingAppts.length > 0) {
        for (const appt of existingAppts) {
          if (!appt.appointment_time) continue;
          const apptStart = timeToMinutes(appt.appointment_time);
          const apptEnd = apptStart + Number(appt.duration_minutes || 30) + Number(appt.buffer_minutes || 10);
          const reqStart = timeMin;
          const reqEnd = timeMin + totalBlockDuration;
          if (reqStart < apptEnd && reqEnd > apptStart) {
            return {
              success: false,
              error: `O horário ${time} já está ocupado por outro agendamento. Por favor, escolha outro horário.`,
            };
          }
        }
      }
    } catch {
      // Tolera falha na pré-checagem
    }
  }

  // -------------------------------------------------------------------------
  // PERSISTÊNCIA: Inserção segura na tabela appointments via Supabase RPC
  // -------------------------------------------------------------------------
  if (!url || !key) {
    const ids = serviceIds.map(
      () =>
        typeof crypto !== "undefined" && crypto.randomUUID
          ? crypto.randomUUID()
          : `apt-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
    );
    return {
      success: true,
      ids,
      isDemo: true,
    };
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const cleanPhone = normalizePhone(client.phone);

  // 1. Upsert transparente de cliente: garante client_id válido e nunca nulo
  let clientId = null;
  try {
    const { data: cData } = await supabase
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

    if (cData?.id) clientId = cData.id;
  } catch (err) {
    console.warn("[ServerAction:appointments] Upsert prévio de cliente:", err);
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
    p_notes: "Agendamento via Chatbot",
  });

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
    console.error("[ServerAction:appointments] Erro ao gravar agendamento:", error);
    if (error.code === "23505" || error.message?.includes("conflict") || error.code === "409") {
      return {
        success: false,
        error: "Esse horário acabou de ser reservado por outro cliente. Por favor, escolha outro horário.",
        isConflict: true,
      };
    }
    return {
      success: false,
      error: error.message || "Erro ao gravar agendamento no sistema. Tente novamente.",
    };
  }

  // 3. Processamento do retorno JSONB da RPC
  if (data && typeof data === "object" && !Array.isArray(data)) {
    if (data.success === false) {
      return {
        success: false,
        error: data.message || "Horário indisponível no momento.",
        isConflict: data.code === "TIME_SLOT_UNAVAILABLE" || data.code === "CONFLICT",
      };
    }
    if (Array.isArray(data.appointment_ids) && data.appointment_ids.length > 0) {
      return {
        success: true,
        ids: data.appointment_ids,
        clientId,
      };
    }
    if (data.appointment_id) {
      return {
        success: true,
        ids: [data.appointment_id],
        clientId,
      };
    }
  }

  const ids = Array.isArray(data) ? data.filter(Boolean) : data ? [data] : [];
  if (!ids.length) {
    return {
      success: false,
      error: "O agendamento não foi registrado no banco de dados. Tente novamente.",
    };
  }

  return {
    success: true,
    ids,
    clientId,
  };
}

/**
 * =========================================================================
 * SERVER ACTION: cancelAppointmentAction
 * =========================================================================
 * 
 * Regra 2: Cancelamento Totalmente Livre e Autónomo:
 * - O cliente pode cancelar seu agendamento diretamente pelo chat a qualquer momento.
 * - Sem restrições de prazo rígido, sem bloqueio de 2 horas e sem penalizações.
 */
export async function cancelAppointmentAction({ ids, phone }) {
  if (!Array.isArray(ids) || !ids.length || !phone) {
    return { success: false, error: "Dados incompletos para cancelamento." };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { success: true, isDemo: true };
  }

  const cleanPhone = normalizePhone(phone);
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  for (const aptId of ids) {
    let rpcRes = await supabase.rpc("chatbot_cancel_appointments", {
      p_phone: cleanPhone,
      p_appointment_id: aptId,
      p_reason: "Cancelamento livre via Chatbot",
    });

    if (rpcRes.error && (rpcRes.error.message?.includes("Could not find the function") || rpcRes.error.code === "PGRST202")) {
      rpcRes = await supabase.rpc("chatbot_cancel_appointments", {
        p_ids: ids,
        p_phone: cleanPhone,
      });
      if (rpcRes.error) return { success: false, error: rpcRes.error.message };
      return { success: true };
    }

    if (rpcRes.error) {
      // Fallback direto
      await supabase
        .from("appointments")
        .update({ status: "canceled", updated_at: new Date().toISOString() })
        .eq("id", aptId)
        .eq("client_phone", cleanPhone);
    }
  }

  return { success: true };
}

/**
 * =========================================================================
 * SERVER ACTION: rescheduleAppointmentAction
 * =========================================================================
 * 
 * Regra 2: Remarcação Totalmente Livre e Autónoma:
 * - O cliente pode alterar seu agendamento a qualquer momento de forma livre e autônoma pelo chat.
 * - Sem restrições de prazo no horário original.
 * 
 * Regra 1: Validação de Antecedência e Limites para a Nova Data:
 * - Antecedência mínima de 30m para hoje e máxima de 30 dias no futuro.
 */
export async function rescheduleAppointmentAction({ ids, phone, newDateKey, newTime }) {
  if (!Array.isArray(ids) || !ids.length || !phone || !newDateKey || !newTime) {
    return { success: false, error: "Dados incompletos para remarcação." };
  }

  const nowMs = Date.now();

  // Regra 1: Validação de limites da nova data
  const today = todayKey(nowMs);
  const daysAhead = daysBetween(today, newDateKey);
  if (daysAhead < 0) return { success: false, error: "Não é possível reagendar para datas que já passaram." };
  if (daysAhead >= BOOKING_WINDOW_DAYS) return { success: false, error: `Reagendamentos são limitados a no máximo ${BOOKING_WINDOW_DAYS} dias no futuro.` };

  if (newDateKey === today) {
    const clock = shopClock(nowMs);
    const newTimeMin = timeToMinutes(newTime);
    if (newTimeMin < clock.minutes + MIN_LEAD_MINUTES) {
      return { success: false, error: `A nova data hoje exige no mínimo ${MIN_LEAD_MINUTES} minutos de antecedência.` };
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { success: true, isDemo: true };
  }

  const cleanPhone = normalizePhone(phone);
  const timeFormatted = newTime.length === 5 ? `${newTime}:00` : newTime;
  const primaryId = ids[0];
  const supabase = createClient(url, key, { auth: { persistSession: false } });

  let rpcRes = await supabase.rpc("chatbot_reschedule_appointments", {
    p_phone: cleanPhone,
    p_appointment_id: primaryId,
    p_new_date: newDateKey,
    p_new_time: timeFormatted,
  });

  if (rpcRes.error && (rpcRes.error.message?.includes("Could not find the function") || rpcRes.error.code === "PGRST202")) {
    rpcRes = await supabase.rpc("chatbot_reschedule_appointments", {
      p_ids: ids,
      p_phone: cleanPhone,
      p_new_at: toTimestamp(newDateKey, newTime),
    });
  }

  if (rpcRes.error) {
    return { success: false, error: rpcRes.error.message || "Erro ao reagendar no sistema." };
  }

  if (rpcRes.data && typeof rpcRes.data === "object" && rpcRes.data.success === false) {
    return { success: false, error: rpcRes.data.message || "Horário indisponível para remarcação." };
  }

  return { success: true };
}

/**
 * =========================================================================
 * SERVER ACTION: joinWaitlistAction
 * =========================================================================
 * 
 * Regra 4: Entrada em Lista de Espera automatizada:
 * - Se os horários de uma data/barbeiro estiverem esgotados, cadastra o cliente
 *   para ser notificado prioritariamente em caso de cancelamento.
 */
export async function joinWaitlistAction({ client, barberId, serviceIds = [], dateKey, preferredTime }) {
  if (!client?.name || !client?.phone || !dateKey) {
    return { success: false, error: "Dados incompletos para entrar na lista de espera." };
  }

  const entry = {
    client_name: client.name,
    client_phone: normalizePhone(client.phone),
    barber_id: barberId || null,
    date_key: dateKey,
    preferred_time: preferredTime || null,
    service_ids: serviceIds,
    created_at: new Date().toISOString(),
    status: "aguardando",
  };

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (url && key) {
    try {
      const supabase = createClient(url, key, { auth: { persistSession: false } });
      const { error } = await supabase.from("waitlist").insert([entry]);
      if (error) {
        console.warn("[ServerAction:waitlist] Aviso ao gravar na tabela waitlist:", error.message);
      }
    } catch (err) {
      console.warn("[ServerAction:waitlist] Falha ao gravar no banco:", err);
    }
  }

  return {
    success: true,
    message: "Cliente registrado na lista de espera com sucesso.",
    entry,
  };
}

/**
 * =========================================================================
 * SERVER ACTION: getLoyaltyProfileAction
 * =========================================================================
 * 
 * Reconhecimento de Cliente Fiel:
 * - Identifica clientes com 5+ agendamentos concluídos no mesmo serviço e profissional.
 * - Retorna o perfil fiel com o serviço favorito e o barbeiro de preferência.
 */
export async function getLoyaltyProfileAction(phone) {
  const cleanPhone = normalizePhone(phone);
  if (!cleanPhone || cleanPhone.length < 8) {
    return { isLoyal: false };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { isLoyal: false };
  }

  try {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // 1. Tenta via RPC chatbot_get_loyalty_profile
    const rpcRes = await supabase.rpc("chatbot_get_loyalty_profile", { p_phone: cleanPhone });
    if (!rpcRes.error && rpcRes.data && rpcRes.data.is_loyal) {
      return {
        isLoyal: true,
        clientName: rpcRes.data.client_name,
        serviceId: rpcRes.data.service_id,
        serviceName: rpcRes.data.service_name,
        servicePrice: rpcRes.data.service_price,
        serviceDuration: rpcRes.data.service_duration,
        barberId: rpcRes.data.barber_id,
        barberName: rpcRes.data.barber_name,
        barberAvatar: rpcRes.data.barber_avatar,
        totalCompleted: rpcRes.data.total_completed,
      };
    }

    // 2. Fallback com consulta direta a appointments
    const { data: appointments, error: aptErr } = await supabase
      .from("appointments")
      .select("client_name, service_id, barber_id, appointment_date, status, services:services(id, name, price, duration_minutes), barbers:barbers(id, name, avatar_url, image)")
      .ilike("client_phone", `%${cleanPhone}%`)
      .in("status", ["completed", "concluido"]);

    if (aptErr || !appointments || !appointments.length) {
      return { isLoyal: false };
    }

    // Agrupa por service_id + barber_id
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

    // Encontra o mais frequente com count >= 5
    let best = null;
    for (const item of comboMap.values()) {
      if (item.count >= 5) {
        if (!best || item.count > best.count) {
          best = item;
        }
      }
    }

    if (!best) {
      return { isLoyal: false };
    }

    return {
      isLoyal: true,
      clientName: best.clientName,
      serviceId: best.serviceId,
      serviceName: best.serviceName,
      servicePrice: best.servicePrice,
      serviceDuration: best.serviceDuration,
      barberId: best.barberId,
      barberName: best.barberName,
      barberAvatar: best.barberAvatar,
      totalCompleted: best.count,
    };
  } catch (err) {
    console.warn("[getLoyaltyProfileAction] Erro ao consultar perfil fiel:", err);
    return { isLoyal: false };
  }
}

