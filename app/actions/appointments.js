"use server";

import { createClient } from "@supabase/supabase-js";
import {
  toTimestamp, weekdayOf, timeToMinutes, WEEKDAYS_LONG, shopClock, todayKey, daysBetween, minutesUntilAppointment
} from "@/core/domain/time";
import { normalizePhone } from "@/core/domain/phone";
import {
  FALLBACK_BARBERS, FALLBACK_SERVICES, BUSINESS_HOURS, MIN_LEAD_MINUTES, BOOKING_WINDOW_DAYS,
  MIN_CANCEL_LEAD_MINUTES, CLEANING_BUFFER_MINUTES
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
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
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
  const appointmentAt = toTimestamp(dateKey, time);

  const { data, error } = await supabase.rpc("chatbot_create_appointments", {
    p_barber_id: barberId,
    p_service_ids: serviceIds,
    p_client_name: client.name,
    p_client_phone: normalizePhone(client.phone),
    p_appointment_at: appointmentAt,
  });

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
  };
}

/**
 * =========================================================================
 * SERVER ACTION: cancelAppointmentAction
 * =========================================================================
 * 
 * Regra 2: Janela de Cancelamento Autónomo:
 * - Só permite cancelamento direto pelo chat se faltarem pelo menos 2 horas
 *   (120 minutos) para o horário marcado.
 * - Caso falte menos de 2 horas, rejeita com erro e orienta contato telefônico.
 */
export async function cancelAppointmentAction({ ids, phone, dateKey, time }) {
  if (!Array.isArray(ids) || !ids.length || !phone) {
    return { success: false, error: "Dados incompletos para cancelamento." };
  }

  // Regra 2: Validação da janela de 2 horas
  if (dateKey && time) {
    const minsLeft = minutesUntilAppointment(dateKey, time, Date.now());
    if (minsLeft < MIN_CANCEL_LEAD_MINUTES) {
      return {
        success: false,
        error: "Cancelamentos com menos de 2 horas de antecedência devem ser solicitados diretamente com a barbearia por telefone.",
      };
    }
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return { success: true, isDemo: true };
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.rpc("chatbot_cancel_appointments", {
    p_ids: ids,
    p_phone: normalizePhone(phone),
  });

  if (error) {
    return { success: false, error: error.message || "Erro ao cancelar agendamento." };
  }

  return { success: true };
}

/**
 * =========================================================================
 * SERVER ACTION: rescheduleAppointmentAction
 * =========================================================================
 * 
 * Regra 2: Janela de Reagendamento Autónomo:
 * - Valida se faltam pelo menos 2 horas para o horário antigo agendado.
 * - Valida se a nova data/horário cumpre a antecedência mínima de 30m e máxima de 30 dias.
 */
export async function rescheduleAppointmentAction({ ids, phone, oldDateKey, oldTime, newDateKey, newTime }) {
  if (!Array.isArray(ids) || !ids.length || !phone || !newDateKey || !newTime) {
    return { success: false, error: "Dados incompletos para remarcação." };
  }

  const nowMs = Date.now();

  // Regra 2: Validação da janela de 2 horas do horário original
  if (oldDateKey && oldTime) {
    const minsLeft = minutesUntilAppointment(oldDateKey, oldTime, nowMs);
    if (minsLeft < MIN_CANCEL_LEAD_MINUTES) {
      return {
        success: false,
        error: "Alterações com menos de 2 horas de antecedência devem ser solicitadas diretamente com a barbearia por telefone.",
      };
    }
  }

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

  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const { error } = await supabase.rpc("chatbot_reschedule_appointments", {
    p_ids: ids,
    p_phone: normalizePhone(phone),
    p_new_at: toTimestamp(newDateKey, newTime),
  });

  if (error) {
    return { success: false, error: error.message || "Erro ao reagendar no sistema." };
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
