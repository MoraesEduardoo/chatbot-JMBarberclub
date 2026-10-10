"use server";

import { createClient } from "@supabase/supabase-js";
import { FALLBACK_SERVICES, FALLBACK_BARBERS, RESTRICTED_SERVICE_NAMES } from "@/core/domain/config";
import { findGalleryPhoto, normalizeStr, resolveHaircutImageUrl } from "@/services/repositories/catalogRepository";

/**
 * Server Action: Obter Catálogo Unificado com Fotos Reais da `haircut_gallery`
 * 
 * Executa no lado do servidor (Next.js App Router):
 * 1. Inicializa o cliente Supabase Server com as credenciais de ambiente.
 * 2. Consulta em paralelo a tabela `services` e a tabela `haircut_gallery`.
 * 3. Para cada foto cadastrada no painel, gera a URL pública oficial através do Supabase Storage.
 * 4. Faz o JOIN inteligente entre o serviço e sua imagem correspondente,
 *    substituindo placeholders vazios pelas fotos reais dos cortes.
 */
export async function getCatalogAction() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return {
      success: true,
      services: [...FALLBACK_SERVICES],
      barbers: [...FALLBACK_BARBERS],
      links: [],
      isDemo: true,
    };
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false },
  });

  try {
    const [servicesRes, barbersRes, linksRes, galleryRes] = await Promise.all([
      supabase.from("services").select("*"),
      supabase.from("barbers").select("id, name"),
      supabase.from("barber_services").select("barber_id, service_id, custom_duration_minutes"),
      supabase.from("haircut_gallery").select("*"),
    ]);

    if (servicesRes.error || barbersRes.error || linksRes.error) {
      console.error("[ServerAction:catalog] Erro nas tabelas principais:", servicesRes.error || barbersRes.error || linksRes.error);
      throw new Error("Falha ao carregar serviços da barbearia.");
    }

    const galleryItems = (galleryRes.data || []).filter((g) => g.is_active !== false);
    const rawServices = servicesRes.data || [];
    const processedServices = [];
    const matchedGalleryIds = new Set();

    for (const s of rawServices) {
      // Procura foto correspondente na haircut_gallery com algoritmo de mapeamento exclusivo
      const matched = findGalleryPhoto(s, galleryItems, matchedGalleryIds);

      let imageUrl = "";
      if (matched) {
        matchedGalleryIds.add(matched.id);
        const rawImg = matched.image_path || matched.image_url || matched.url || matched.photo_url || matched.image;
        imageUrl = resolveHaircutImageUrl(supabase, rawImg);
      }

      processedServices.push({
        id: s.id,
        name: s.name,
        price: Number(s.price),
        durationMinutes: s.default_duration_minutes ?? 0,
        image: imageUrl,
        restricted: RESTRICTED_SERVICE_NAMES.includes(s.name),
      });
    }

    // Se a tabela services estiver vazia, utiliza diretamente os cortes da galeria
    if (processedServices.length === 0 && galleryItems.length > 0) {
      for (const g of galleryItems) {
        const rawImg = g.image_path || g.image_url || g.url || g.photo_url || g.image;
        processedServices.push({
          id: g.service_id || g.id,
          name: g.title || "Corte",
          price: Number(g.price || 25),
          durationMinutes: g.duration_minutes ?? 0,
          image: resolveHaircutImageUrl(supabase, rawImg),
          restricted: RESTRICTED_SERVICE_NAMES.includes(g.title),
        });
      }
    }

    return {
      success: true,
      services: processedServices.length ? processedServices : [...FALLBACK_SERVICES],
      barbers: barbersRes.data?.length ? barbersRes.data.map((b) => ({ id: b.id, name: b.name, image: "" })) : [...FALLBACK_BARBERS],
      links: (linksRes.data || []).map((l) => ({
        barberId: l.barber_id,
        serviceId: l.service_id,
        customDurationMinutes: l.custom_duration_minutes ?? null,
      })),
    };
  } catch (err) {
    console.error("[ServerAction:catalog] Exceção:", err);
    return {
      success: false,
      error: err.message,
      services: [...FALLBACK_SERVICES],
      barbers: [...FALLBACK_BARBERS],
      links: [],
    };
  }
}
