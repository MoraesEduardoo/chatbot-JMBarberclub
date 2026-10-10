"use server";

import { createClient } from "@supabase/supabase-js";
import { toTimestamp, weekdayOf, timeToMinutes, WEEKDAYS_LONG } from "@/core/domain/time";
import { normalizePhone } from "@/core/domain/phone";
import { FALLBACK_BARBERS, BUSINESS_HOURS } from "@/core/domain/config";
import { normalizeDayOfWeek, buildBarberScheduleMap } from "@/services/repositories/catalogRepository";

/**
 * Server Action: Validação de Segurança e Criação de Agendamentos (Backend Guard)
 * 
 * Regras estritas de integridade de dados e expediente:
 * 1. Consulta em tempo real a tabela `barber_schedules` do barbeiro selecionado.
 * 2. Se o barbeiro estiver de folga ou com o dia fechado (ex: Matheus na segunda-feira),
 *    rejeita a requisição imediatamente impedindo a gravação em `appointments`.
 * 3. Valida se o horário solicitado está estritamente dentro da janela de funcionamento
 *    do profissional e fora do horário de intervalo de almoço/pausa.
 * 4. Insere de forma atômica e segura na tabela `appointments` via RPC.
 */
export async function createAppointmentAction({ client, barberId, serviceIds, dateKey, time }) {
  if (!client?.name || !client?.phone || !barberId || !Array.isArray(serviceIds) || !serviceIds.length || !dateKey || !time) {
    return {
      success: false,
      error: "Dados incompletos para efetuar o agendamento.",
    };
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const weekday = weekdayOf(dateKey); // 0 = domingo ... 6 = sábado
  const weekdayName = WEEKDAYS_LONG[weekday] || "este dia da semana";

  // =========================================================================
  // 1. BACKEND GUARD: Consulta rigorosa da escala de expediente (barber_schedules)
  // =========================================================================
  let scheduleForDay = null;

  if (url && key) {
    const supabase = createClient(url, key, { auth: { persistSession: false } });

    // Consulta os registros de escala cadastrados para o barbeiro no painel administrativo
    let { data: schedulesData, error: schedError } = await supabase
      .from("barber_schedules")
      .select("*")
      .eq("barber_id", barberId);

    if (schedError) {
      // Tenta tabela alternativa caso o nome no banco seja barber_schedule
      const alt = await supabase
        .from("barber_schedule")
        .select("*")
        .eq("barber_id", barberId);
      if (!alt.error) schedulesData = alt.data;
    }

    if (Array.isArray(schedulesData) && schedulesData.length > 0) {
      const scheduleMap = buildBarberScheduleMap(schedulesData, barberId);
      if (scheduleMap) {
        // Se o barbeiro tem escala cadastrada no banco, qualquer dia ausente ou com is_working=false é fechado
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

  // Fallback: se não houver dados no banco ou em modo de demonstração local
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
      // Fallback para os horários gerais da barbearia
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

  // =========================================================================
  // 2. BACKEND GUARD: Validação de horário de início, fim e intervalo de almoço
  // =========================================================================
  const timeMin = timeToMinutes(time);
  const startMin = timeToMinutes(scheduleForDay.start || "09:00");
  const endMin = timeToMinutes(scheduleForDay.end || "19:00");

  if (timeMin < startMin || timeMin >= endMin) {
    return {
      success: false,
      error: `O horário selecionado (${time}) está fora do expediente de atendimento do barbeiro (${scheduleForDay.start} às ${scheduleForDay.end}).`,
    };
  }

  const lunchStart = scheduleForDay.lunchStart ?? scheduleForDay.breakStart;
  const lunchEnd = scheduleForDay.lunchEnd ?? scheduleForDay.breakEnd;
  if (lunchStart && lunchEnd) {
    const lStartMin = timeToMinutes(lunchStart);
    const lEndMin = timeToMinutes(lunchEnd);
    if (timeMin >= lStartMin && timeMin < lEndMin) {
      return {
        success: false,
        error: `O horário selecionado (${time}) coincide com a pausa/almoço do profissional (${lunchStart} às ${lunchEnd}). Por favor, escolha outro horário.`,
      };
    }
  }

  // =========================================================================
  // 3. PERSISTÊNCIA: Inserção segura na tabela appointments via Supabase
  // =========================================================================
  if (!url || !key) {
    // Modo de demonstração (quando Supabase não estiver configurado)
    const batchKey = new Date().toISOString();
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
