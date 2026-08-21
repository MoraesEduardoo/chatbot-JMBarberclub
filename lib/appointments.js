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

export async function saveAppointment(draft) {
  const client = assertSupabase();
  const { error } = await client.rpc("chatbot_create_appointments", {
    p_barber_id: draft.barber.id,
    p_service_ids: draft.services.map((service) => service.id),
    p_client_name: draft.name,
    p_client_phone: draft.phone,
    p_appointment_at: appointmentDateTime(draft.date, draft.time),
  });
  if (error) throw new Error(error.code === "23505" ? "Este horário acabou de ser reservado. Escolha outro, por favor." : error.message);
}
