/** Catálogo (serviços, barbeiros e vínculos). Devolve SEMPRE o formato normalizado do domínio. */
import { FALLBACK_BARBERS, FALLBACK_SERVICES, RESTRICTED_SERVICE_NAMES } from "../../core/domain/config.js";
import { getSupabase } from "../supabase/browser.js";
import { AppError } from "../errors.js";

export async function loadCatalog() {
  const supabase = getSupabase();
  if (!supabase) {
    return { services: [...FALLBACK_SERVICES], barbers: [...FALLBACK_BARBERS], links: [] };
  }

  const [services, barbers, links, gallery] = await Promise.all([
    supabase.from("services").select("id, name, price, default_duration_minutes"),
    supabase.from("barbers").select("id, name"),
    supabase.from("barber_services").select("barber_id, service_id, custom_duration_minutes"),
    supabase.from("haircut_gallery").select("id, title, image_path, category, is_active").eq("is_active", true),
  ]);

  if (services.error || barbers.error || links.error) {
    console.error("[chat] falha ao carregar catálogo:", services.error ?? barbers.error ?? links.error);
    throw new AppError("unknown", "Não foi possível carregar os dados da barbearia.");
  }

  // Helper para gerar a URL pública da foto no Storage do Supabase
  const getImageUrl = (imagePath) => {
    if (!imagePath) return "";
    if (imagePath.startsWith("http")) return imagePath;
    const { data } = supabase.storage.from("haircut-photos").getPublicUrl(imagePath);
    return data?.publicUrl ?? "";
  };

  // Helper para remover acentos e normalizar strings para comparação segura
  const normalizeStr = (str) => {
    if (!str) return "";
    return str
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();
  };

  const galleryData = gallery.data ?? [];

  return {
    services: services.data.map((s) => {
      const normalizedServiceName = normalizeStr(s.name);

      // Procura na galeria combinando título ou categoria de forma limpa (sempre tolerante a acentos)
      const matchedPhoto = galleryData.find((g) => {
        const normTitle = normalizeStr(g.title);
        const normCategory = normalizeStr(g.category);
        return normTitle.includes(normalizedServiceName) || 
               normalizedServiceName.includes(normTitle) ||
               normCategory.includes(normalizedServiceName);
      });

      return {
        id: s.id,
        name: s.name,
        price: Number(s.price),
        durationMinutes: s.default_duration_minutes ?? 0,
        image: matchedPhoto ? getImageUrl(matchedPhoto.image_path) : "",
        restricted: RESTRICTED_SERVICE_NAMES.includes(s.name),
      };
    }),
    barbers: barbers.data.length ? barbers.data.map((b) => ({ id: b.id, name: b.name, image: "" })) : [...FALLBACK_BARBERS],
    links: links.data.map((l) => ({
      barberId: l.barber_id,
      serviceId: l.service_id,
      customDurationMinutes: l.custom_duration_minutes ?? null,
    })),
  };
}