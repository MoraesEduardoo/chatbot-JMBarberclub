import { BARBERS, SERVICES } from "./data";
import { toDateKey } from "./schedule";
import { assertSupabase, supabase } from "./supabase";

function appointmentDateTime(date, time) {
  // appointments.appointment_date é timestamptz; o horário é salvo nele.
  return `${toDateKey(date)}T${time}:00-03:00`;
}

export async function getCatalog() {
  if (!supabase) return { services: SERVICES, barbers: BARBERS, links: [] };
  const [servicesResult, barbersResult, linksResult] = await Promise.all([
    supabase.from("services").select("id, name, price, default_duration_minutes"),
    supabase.from("barbers").select("id, name"),
    supabase.from("barber_services").select("barber_id, service_id, custom_duration_minutes"),
  ]);
  if (servicesResult.error || barbersResult.error || linksResult.error) throw new Error("Não foi possível carregar os dados da barbearia.");
  return {
    // Com Supabase configurado, nunca usar os IDs locais "matheus"/"william":
    // barber_id e service_id são UUIDs e devem vir das tabelas reais.
    services: servicesResult.data.map((service) => ({ ...service, duration: service.default_duration_minutes ?? 0, image: "", williamOnly: ["Sobrancelha na linha", "Corte Freestyle"].includes(service.name) })),
    // Os UUIDs de contingência são reais, informados para Matheus e William.
    // Assim os cards permanecem disponíveis mesmo se o SELECT de barbers for bloqueado pelo RLS.
    barbers: barbersResult.data.length ? barbersResult.data.map((barber) => ({ ...barber, image: "" })) : BARBERS,
    links: linksResult.data,
  };
}

export async function getBookedTimes(barberId, date) {
  const { data, error } = await assertSupabase().rpc("chatbot_booked_times", { p_barber_id: barberId, p_date: toDateKey(date) });
  if (error) throw new Error(error.message);
  return new Set((data || []).map((item) => String(item.appointment_time).slice(0, 5)));
}

/**
 * Avisa o painel do barbeiro (push "Novo agendamento!"). Roda depois que o
 * agendamento já está gravado e NUNCA derruba o fluxo: se o painel estiver
 * fora do ar ou sem as variáveis configuradas, o cliente continua vendo
 * "Agendamento confirmado" — a marcação já está no banco e aparece na
 * agenda do barbeiro de qualquer forma (Realtime + carregamento da tela).
 */
async function notifyAdminPanel(appointmentId) {
  if (!appointmentId) return;

  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 12_000);

  try {
    const response = await fetch("/api/notify-admin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // A confirmação do agendamento pode trocar a tela logo em seguida;
      // keepalive dá ao navegador a chance de concluir esta pequena ponte
      // mesmo durante essa transição. O backend continua sendo o único que
      // conhece o segredo do painel.
      keepalive: true,
      cache: "no-store",
      signal: controller.signal,
      body: JSON.stringify({ appointmentId }),
    });

    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.notified) {
      console.error("[chat] Agendamento salvo, mas o painel não confirmou o aviso:", {
        status: response.status,
        result,
      });
    }
  } catch (error) {
    console.error("[chat] Agendamento salvo, mas o aviso ao painel falhou:", error);
  } finally {
    window.clearTimeout(timeoutId);
  }
}

function isConflictError(error) {
  // O Supabase normalmente devolve 23505, mas alguns proxies preservam só o
  // status HTTP 409. Tratamos as duas formas para que uma resposta perdida
  // nunca transforme uma reserva já gravada em erro na interface.
  return error?.code === "23505" || error?.status === 409;
}

/**
 * Confere se já existe, no banco, um agendamento com o mesmo barbeiro,
 * telefone e horário de início deste draft. Usada só quando a RPC devolve
 * 23505/409: duas chamadas podem se cruzar (ex.: a resposta da 1ª tentativa
 * se perdeu por instabilidade de rede e o cliente reenviou o formulário) e,
 * nesse caso, o "conflito" não é um erro — é a prova de que o agendamento
 * que o cliente queria já está gravado. Devolve o id existente ou null.
 */
async function findMatchingAppointment(client, draft) {
  try {
    const phone = (draft.phone || "").replace(/\D/g, "");
    const startsAt = appointmentDateTime(draft.date, draft.time);
    const { data, error } = await client
      .from("appointments")
      .select("id")
      .eq("barber_id", draft.barber.id)
      .eq("client_phone", phone)
      .eq("appointment_date", startsAt)
      .order("id", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return null;
    return data.id;
  } catch {
    return null;
  }
}

export async function saveAppointment(draft) {
  const client = assertSupabase();

  const { data, error } = await client.rpc("chatbot_create_appointments", {
    p_barber_id: draft.barber.id,
    p_service_ids: draft.services.map((service) => service.id),
    p_client_name: draft.name,
    p_client_phone: draft.phone,
    p_appointment_at: appointmentDateTime(draft.date, draft.time),
  });

  if (error) {
    // PGRST202 / 42883 = a função não existe (ou está com outra
    // assinatura) no banco. Sem isso o chat mostra "confirmado" sem nada
    // ter sido gravado — que é exatamente o sintoma a evitar.
    if (error.code === "PGRST202" || error.code === "42883") {
      throw new Error(
        "A função de agendamento não está instalada no banco. Rode supabase/migrations/010_chatbot_create_appointments.sql no SQL Editor do Supabase."
      );
    }

    // 23505 é o código do Postgres para violação de unicidade — o
    // PostgREST traduz isso para HTTP 409. Antes de assustar o cliente
    // com "horário indisponível", conferimos se o registro que ele
    // queria já está no banco (ver findMatchingAppointment acima). Se
    // estiver, a tela de sucesso é exibida normalmente e o aviso ao
    // painel é (re)disparado — importante porque, se o conflito veio de
    // uma 1ª chamada cuja resposta se perdeu antes de chegar ao
    // navegador, o notifyAdminPanel dela nunca chegou a rodar.
    if (isConflictError(error)) {
      const existingId = await findMatchingAppointment(client, draft);
      if (existingId) {
        await notifyAdminPanel(existingId);
        return [existingId];
      }
      throw new Error("Este horário acabou de ser reservado. Escolha outro, por favor.");
    }

    throw new Error(error.message);
  }

  // A RPC devolve os ids criados (um por serviço). Array vazio significa
  // que nada foi gravado — melhor falhar aqui do que dizer ao cliente que
  // está agendado e o barbeiro nunca ver o horário na agenda.
  const createdIds = Array.isArray(data) ? data.filter(Boolean) : data ? [data] : [];

  if (createdIds.length === 0) {
    throw new Error(
      "O agendamento não foi gravado no sistema da barbearia. Tente novamente ou chame no WhatsApp."
    );
  }

  // Conferência final: relê no banco o que acabou de ser inserido. Se o
  // SELECT não devolver a linha, algo bloqueou a escrita e o cliente
  // precisa saber disso agora, não na hora de sentar na cadeira.
  const { data: saved, error: checkError } = await client
    .from("appointments")
    .select("id")
    .in("id", createdIds);

  if (!checkError && (!saved || saved.length === 0)) {
    throw new Error(
      "O agendamento não foi confirmado no sistema da barbearia. Tente novamente ou chame no WhatsApp."
    );
  }

  // Um push por agendamento (o painel agrupa pela tag do id).
  await notifyAdminPanel(createdIds[0]);

  return createdIds;
}
