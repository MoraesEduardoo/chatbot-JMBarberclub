/** Catálogo (serviços, barbeiros e vínculos). Devolve SEMPRE o formato normalizado do domínio. */
import { FALLBACK_BARBERS, FALLBACK_SERVICES, RESTRICTED_SERVICE_NAMES } from "../../core/domain/config.js";
import { getSupabase } from "../supabase/browser.js";
import { AppError } from "../errors.js";

export async function loadCatalog() {
  const supabase = getSupabase();
  if (!supabase) {
    return { services: [...FALLBACK_SERVICES], barbers: [...FALLBACK_BARBERS], links: [] };
  }

  const [services, barbers, links] = await Promise.all([
    supabase.from("services").select("id, name, price, default_duration_minutes"),
    supabase.from("barbers").select("id, name"),
    supabase.from("barber_services").select("barber_id, service_id, custom_duration_minutes"),
  ]);
  if (services.error || barbers.error || links.error) {
    console.error("[chat] falha ao carregar catálogo:", services.error ?? barbers.error ?? links.error);
    throw new AppError("unknown", "Não foi possível carregar os dados da barbearia.");
  }

  return {
    services: services.data.map((s) => ({
      id: s.id,
      name: s.name,
      price: Number(s.price),
      durationMinutes: s.default_duration_minutes ?? 0,
      image: "",
      restricted: RESTRICTED_SERVICE_NAMES.includes(s.name),
    })),
    // Os UUIDs de contingência são reais (Matheus e William): os cards continuam
    // disponíveis mesmo se o SELECT em `barbers` estiver bloqueado pelo RLS.
    barbers: barbers.data.length ? barbers.data.map((b) => ({ id: b.id, name: b.name, image: "" })) : [...FALLBACK_BARBERS],
    links: links.data.map((l) => ({
      barberId: l.barber_id,
      serviceId: l.service_id,
      customDurationMinutes: l.custom_duration_minutes ?? null,
    })),
  };
}
