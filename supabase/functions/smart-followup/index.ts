// ============================================================================
// SUPABASE EDGE FUNCTION: smart-followup
// Automação de Retorno Inteligente da Barbearia JM Barberclub
// Executada diariamente às 09:00 via Cron Job do Supabase / pg_cron
// ============================================================================

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FollowupCandidate {
  client_phone: string;
  client_name: string;
  total_cuts: number;
  last_appointment_date: string;
  avg_interval_days: number;
  days_since_last_cut: number;
  days_overdue: number;
  favorite_service_name?: string;
  favorite_barber_name?: string;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    if (!supabaseUrl || !supabaseServiceKey) {
      throw new Error("Variáveis de ambiente SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórias.");
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Consulta os clientes elegíveis para reativação
    // Regra: Passaram 3 dias além da média de intervalo histórico, sem agendamento futuro
    let candidates: FollowupCandidate[] = [];

    const { data: rpcData, error: rpcError } = await supabase.rpc("get_smart_followup_candidates");

    if (!rpcError && Array.isArray(rpcData)) {
      candidates = rpcData;
    } else {
      console.warn("[smart-followup] RPC get_smart_followup_candidates não disponível, executando query direta:", rpcError?.message);

      // Query direta de contingência caso a RPC não tenha sido executada no banco
      const { data: rawAppointments, error: queryErr } = await supabase
        .from("appointments")
        .select("client_phone, client_name, appointment_date, status, service:services(name), barber:barbers(name)")
        .order("appointment_date", { ascending: true });

      if (queryErr) throw queryErr;

      // Agrupa no código da Edge Function
      const clientMap = new Map<string, {
        name: string;
        completedDates: string[];
        hasFutureActive: boolean;
        serviceCounts: Record<string, number>;
        barberCounts: Record<string, number>;
      }>();

      const todayStr = new Date().toISOString().slice(0, 10);

      for (const apt of rawAppointments || []) {
        const phone = String(apt.client_phone || "").replace(/\D/g, "");
        if (!phone) continue;

        if (!clientMap.has(phone)) {
          clientMap.set(phone, {
            name: apt.client_name || "Cliente",
            completedDates: [],
            hasFutureActive: false,
            serviceCounts: {},
            barberCounts: {},
          });
        }

        const c = clientMap.get(phone)!;
        const isCompleted = apt.status === "completed" || apt.status === "concluido";
        const isActive = ["confirmed", "confirmado", "pending", "pendente"].includes(apt.status);

        if (isActive && apt.appointment_date >= todayStr) {
          c.hasFutureActive = true;
        }

        if (isCompleted && apt.appointment_date) {
          c.completedDates.push(apt.appointment_date);
          const sName = apt.service?.name;
          const bName = apt.barber?.name;
          if (sName) c.serviceCounts[sName] = (c.serviceCounts[sName] || 0) + 1;
          if (bName) c.barberCounts[bName] = (c.barberCounts[bName] || 0) + 1;
        }
      }

      // Calcula médias e atrasos
      const nowMs = Date.now();
      for (const [phone, c] of clientMap.entries()) {
        if (c.hasFutureActive || c.completedDates.length < 2) continue;

        const sortedDates = [...new Set(c.completedDates)].sort();
        if (sortedDates.length < 2) continue;

        const firstDate = new Date(sortedDates[0]).getTime();
        const lastDate = new Date(sortedDates[sortedDates.length - 1]).getTime();
        const totalIntervalDays = (lastDate - firstDate) / 86_400_000;
        const avgInterval = Math.round((totalIntervalDays / (sortedDates.length - 1)) * 10) / 10;
        const daysSinceLast = Math.floor((nowMs - lastDate) / 86_400_000);
        const daysOverdue = Math.round((daysSinceLast - avgInterval) * 10) / 10;

        // Se passaram 3 dias além da média
        if (daysSinceLast >= avgInterval + 3) {
          candidates.push({
            client_phone: phone,
            client_name: c.name,
            total_cuts: sortedDates.length,
            last_appointment_date: sortedDates[sortedDates.length - 1],
            avg_interval_days: avgInterval,
            days_since_last_cut: daysSinceLast,
            days_overdue: daysOverdue,
          });
        }
      }
    }

    console.info(`[smart-followup] Encontrados ${candidates.length} clientes elegíveis para reativação.`);

    const results = [];
    const whatsappApiUrl = Deno.env.get("WHATSAPP_API_URL") || "";
    const whatsappApiToken = Deno.env.get("WHATSAPP_API_TOKEN") || "";

    for (const client of candidates) {
      const firstName = (client.client_name || "Amigo").split(" ")[0].trim();
      
      // Mensagem padronizada oficial solicitada pela JM Barberclub
      const message = `Fala, ${firstName}! Notamos que já passou da hora de alinhar a régua. Bora marcar essa semana? ✂️💈\n\nEscolha seu melhor horário: https://chatbot-jmbarberclub.vercel.app/`;

      let sendStatus = "simulated";

      // Disparo real caso a API de WhatsApp esteja configurada (ex: Evolution API / Z-API)
      if (whatsappApiUrl && whatsappApiToken) {
        try {
          const res = await fetch(whatsappApiUrl, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${whatsappApiToken}`,
              apikey: whatsappApiToken,
            },
            body: JSON.stringify({
              number: client.client_phone.startsWith("55") ? client.client_phone : `55${client.client_phone}`,
              text: message,
            }),
          });
          sendStatus = res.ok ? "sent" : "failed";
        } catch (err) {
          console.error(`[smart-followup] Erro ao enviar WhatsApp para ${client.client_phone}:`, err);
          sendStatus = "failed";
        }
      }

      // Registra o log no banco de dados para evitar reenvio nos próximos 7 dias
      await supabase.from("followup_logs").insert([
        {
          client_phone: client.client_phone,
          client_name: client.client_name,
          days_since_last_cut: client.days_since_last_cut,
          avg_interval_days: client.avg_interval_days,
          days_overdue: client.days_overdue,
          message,
          status: sendStatus,
          channel: "whatsapp",
          dispatched_at: new Date().toISOString(),
        },
      ]);

      results.push({
        phone: client.client_phone,
        name: client.client_name,
        avgInterval: client.avg_interval_days,
        daysOverdue: client.days_overdue,
        status: sendStatus,
      });
    }

    return new Response(
      JSON.stringify({
        success: true,
        timestamp: new Date().toISOString(),
        candidatesFound: candidates.length,
        dispatched: results,
      }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error("[smart-followup] Erro de execução:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      }
    );
  }
});
