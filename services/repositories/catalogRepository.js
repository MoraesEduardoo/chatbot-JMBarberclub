/**
 * Repositório de Catálogo e Galeria de Cortes:
 * Unifica a consulta das tabelas `services` e `haircut_gallery` do Supabase para o Chatbot.
 * 
 * Como a URL da imagem da `haircut_gallery` é montada e vinculada:
 * 1. Consulta em paralelo a tabela `services` e a tabela `haircut_gallery` (que contém id, title, category, barber_id e image_path).
 * 2. Para cada registro da galeria, a função `resolveHaircutImageUrl` constrói a URL pública oficial
 *    através de `supabase.storage.from(...).getPublicUrl(cleanPath)`:
 *    - Se já for URL absoluta (https://...), mantém intacta.
 *    - Se contiver prefixo de bucket (ex: "haircut-photos/...", "haircut_gallery/..."), extrai o bucket correspondente.
 *    - Por padrão, usa o bucket "haircut-photos" do Supabase Storage.
 * 3. Realiza o vínculo inteligente (JOIN / matching) entre cada serviço e sua foto correspondente
 *    (por service_id, título exato, categoria ou tokens de similaridade).
 * 4. Injeta a URL pública real no campo `image` de cada cartão de serviço enviado ao chat.
 */

import { FALLBACK_BARBERS, FALLBACK_SERVICES, RESTRICTED_SERVICE_NAMES } from "../../core/domain/config.js";
import { getSupabase } from "../supabase/browser.js";
import { AppError } from "../errors.js";

/**
 * Normaliza strings para comparação flexível (remove acentos, pontuações e caixa alta).
 */
export function normalizeStr(str) {
  if (!str) return "";
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Extrai palavras-chave significativas ignorando termos comuns.
 */
function extractTokens(str) {
  const norm = normalizeStr(str);
  if (!norm) return [];
  const stopWords = new Set(["corte", "ou", "de", "da", "do", "e", "na", "no", "com", "simples", "para", "pra"]);
  return norm
    .split(/[^a-z0-9]+/)
    .filter((tok) => tok.length >= 3 && !stopWords.has(tok));
}

export const DEFAULT_HAIRCUT_STORAGE_BUCKET = "haircut-gallery";

export const KNOWN_STORAGE_BUCKETS = [
  "haircut-gallery",
  "haircut_gallery",
  "haircut-photos",
  "haircuts",
  "gallery",
  "cortes",
  "services",
];

/**
 * Constrói a URL pública definitiva da foto do corte armazenada no Supabase Storage.
 * Projetada especificamente para PREVENIR ERRO 400 (Bad Request):
 * 
 * 1. URLs completas (http:// ou https://):
 *    - Se for do Supabase Storage, sanitiza barras duplas (//) no pathname.
 *    - Remove repetições do bucket geradas acidentalmente (ex: /haircut-gallery/haircut-gallery/).
 * 
 * 2. Caminhos relativos de Storage (/storage/v1/object/public/...):
 *    - Limpa barras duplas e duplicações de bucket.
 *    - Concatena com NEXT_PUBLIC_SUPABASE_URL.
 * 
 * 3. Caminhos relativos (ex: "corte.webp", "/haircut-gallery/corte.webp", "haircut-gallery//corte.webp"):
 *    - Remove barras no início e fim.
 *    - Remove barras duplas internas (/+/ -> /).
 *    - Identifica e remove o prefixo do bucket do caminho do objeto (para evitar duplicar o bucket).
 *    - Utiliza o bucket oficial "haircut-gallery".
 *    - Chama `supabase.storage.from('haircut-gallery').getPublicUrl(cleanPath)` passando o caminho sem barra inicial.
 *    - Sanitiza a URL final gerada.
 * 
 * 4. Fallback:
 *    - Se o caminho for nulo, vazio ou inválido, retorna string vazia para que o componente
 *      exiba o placeholder elegante sem quebrar a interface nem poluir o console.
 */
export function resolveHaircutImageUrl(supabase, rawPath) {
  if (!rawPath) return "";

  let path = typeof rawPath === "string" ? rawPath.trim() : "";
  if (!path) return "";

  // Suporte defensivo caso o campo tenha vindo serializado como JSON (ex: '{"path":"..."}')
  if (path.startsWith("{") || path.startsWith("[")) {
    try {
      const parsed = JSON.parse(path);
      path = (parsed.path || parsed.url || parsed.image_path || parsed.image || parsed[0] || "").trim();
      if (!path) return "";
    } catch {
      // continua com string original
    }
  }

  // 1. Já é URL pública absoluta (HTTP / HTTPS)
  if (path.startsWith("http://") || path.startsWith("https://")) {
    try {
      const urlObj = new URL(path);
      // Sanitiza o pathname se for endpoint do Supabase Storage
      if (urlObj.pathname.includes("/storage/v1/object/public/")) {
        let cleanPathname = urlObj.pathname.replace(/\/{2,}/g, "/");
        // Remove repetições do bucket (ex: /haircut-gallery/haircut-gallery/ -> /haircut-gallery/)
        cleanPathname = cleanPathname.replace(
          /\/storage\/v1\/object\/public\/([^/]+)\/\1\//g,
          "/storage/v1/object/public/$1/"
        );
        urlObj.pathname = cleanPathname;
        return urlObj.toString();
      }
      return path;
    } catch {
      // Se URL parser falhar em URLs incomuns, limpa barras duplas na porção pós-protocolo
      const [proto, rest] = path.split("://");
      const cleanRest = rest ? rest.replace(/\/{2,}/g, "/") : "";
      return `${proto}://${cleanRest}`;
    }
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/+$/, "") || "";

  // 2. Caminho relativo da API de Storage do Supabase (/storage/v1/object/public/...)
  const storageApiPrefix = "storage/v1/object/public/";
  const noLeadSlash = path.replace(/^\/+/, "");

  if (noLeadSlash.startsWith(storageApiPrefix)) {
    const afterPrefix = noLeadSlash.substring(storageApiPrefix.length).replace(/^\/+/, "");
    let cleanAfter = afterPrefix.replace(/\/{2,}/g, "/");
    cleanAfter = cleanAfter.replace(/^([^/]+)\/\1\//, "$1/");

    if (supabaseUrl) {
      return `${supabaseUrl}/${storageApiPrefix}${cleanAfter}`;
    }
    return `/${storageApiPrefix}${cleanAfter}`;
  }

  // 3. Caminho relativo de arquivo dentro do bucket (ex: "corte.webp", "/haircut-gallery/corte.webp")
  // Limpa barras iniciais, finais e colapsa barras duplas (// -> /)
  let cleanRelPath = path.replace(/^\/+/, "").replace(/\/+$/, "").replace(/\/{2,}/g, "/").trim();
  if (!cleanRelPath) return "";

  // Detecta se o caminho já veio prefixado com o nome do bucket para evitar bucket duplicado
  let targetBucket = DEFAULT_HAIRCUT_STORAGE_BUCKET;

  for (const bucket of KNOWN_STORAGE_BUCKETS) {
    const prefix = `${bucket.toLowerCase()}/`;
    if (cleanRelPath.toLowerCase().startsWith(prefix)) {
      targetBucket = bucket;
      cleanRelPath = cleanRelPath.substring(prefix.length).replace(/^\/+/, "");
      // Remove repetições adicionais acidentais (ex: haircut-gallery/haircut-gallery/...)
      while (cleanRelPath.toLowerCase().startsWith(prefix)) {
        cleanRelPath = cleanRelPath.substring(prefix.length).replace(/^\/+/, "");
      }
      break;
    }
  }

  // Remove qualquer barra residual no início
  cleanRelPath = cleanRelPath.replace(/^\/+/, "").trim();
  if (!cleanRelPath) return "";

  // 4. Utiliza o método oficial supabase.storage.from(targetBucket).getPublicUrl(cleanRelPath)
  if (supabase?.storage?.from) {
    try {
      const { data } = supabase.storage.from(targetBucket).getPublicUrl(cleanRelPath);
      if (data?.publicUrl) {
        let finalUrl = data.publicUrl;
        try {
          const urlObj = new URL(finalUrl);
          urlObj.pathname = urlObj.pathname.replace(/\/{2,}/g, "/");
          urlObj.pathname = urlObj.pathname.replace(
            /\/storage\/v1\/object\/public\/([^/]+)\/\1\//g,
            "/storage/v1/object/public/$1/"
          );
          return urlObj.toString();
        } catch {
          return finalUrl;
        }
      }
    } catch (err) {
      console.warn("[chat] Erro ao chamar getPublicUrl no Supabase Storage:", err);
    }
  }

  // 5. Fallback com construção direta da URL do Supabase Storage
  if (supabaseUrl) {
    return `${supabaseUrl}/storage/v1/object/public/${targetBucket}/${cleanRelPath}`;
  }

  return "";
}

/**
 * Encontra a foto ideal na `haircut_gallery` para um dado serviço.
 */
export function findGalleryPhoto(service, galleryList) {
  if (!galleryList?.length) return null;

  const serviceNameNorm = normalizeStr(service.name);
  const serviceId = String(service.id);

  // 1. Vínculo explícito por service_id (se presente na tabela haircut_gallery)
  const byServiceId = galleryList.find((g) => g.service_id && String(g.service_id) === serviceId);
  if (byServiceId) return byServiceId;

  // 2. Título da galeria idêntico ao nome do serviço
  const byExactTitle = galleryList.find((g) => normalizeStr(g.title) === serviceNameNorm);
  if (byExactTitle) return byExactTitle;

  // 3. Categoria idêntica ao nome do serviço
  const byExactCategory = galleryList.find((g) => normalizeStr(g.category) === serviceNameNorm);
  if (byExactCategory) return byExactCategory;

  // 4. Inclusão direta de substrings (ex: "Degradê" contido em "Degradê Navalhado" ou vice-versa)
  const bySubstring = galleryList.find((g) => {
    const normTitle = normalizeStr(g.title);
    const normCategory = normalizeStr(g.category);
    return (
      (normTitle && (serviceNameNorm.includes(normTitle) || normTitle.includes(serviceNameNorm))) ||
      (normCategory && (serviceNameNorm.includes(normCategory) || normCategory.includes(serviceNameNorm)))
    );
  });
  if (bySubstring) return bySubstring;

  // 5. Casamento inteligente por sobreposição de palavras-chave (tokens)
  const serviceTokens = extractTokens(service.name);
  let bestMatch = null;
  let bestScore = 0;

  for (const g of galleryList) {
    const titleTokens = extractTokens(g.title);
    const categoryTokens = extractTokens(g.category);
    const allTokens = [...new Set([...titleTokens, ...categoryTokens])];

    let score = 0;
    for (const sTok of serviceTokens) {
      if (
        allTokens.some(
          (gTok) =>
            gTok === sTok ||
            (gTok.length >= 4 && sTok.startsWith(gTok)) ||
            (sTok.length >= 4 && gTok.startsWith(sTok))
        )
      ) {
        score += 1;
      }
    }

    if (score > bestScore) {
      bestScore = score;
      bestMatch = g;
    }
  }

  if (bestScore > 0) {
    return bestMatch;
  }

  return null;
}

/**
 * Carrega o catálogo unificado de serviços e fotos para o Chatbot.
 */
export async function loadCatalog() {
  const supabase = getSupabase();
  if (!supabase) {
    return { services: [...FALLBACK_SERVICES], barbers: [...FALLBACK_BARBERS], links: [] };
  }

  // Consulta paralela das tabelas de negócio e da galeria de fotos do painel
  const [servicesRes, barbersRes, linksRes, galleryRes] = await Promise.all([
    supabase.from("services").select("*"),
    supabase.from("barbers").select("id, name"),
    supabase.from("barber_services").select("barber_id, service_id, custom_duration_minutes"),
    // Busca dados da tabela haircut_gallery sem filtros que possam quebrar schemas personalizados
    supabase.from("haircut_gallery").select("*"),
  ]);

  // Se houver falha crítica nas tabelas estruturais de agendamento
  if (servicesRes.error || barbersRes.error || linksRes.error) {
    console.error("[chat] falha ao carregar tabelas principais:", servicesRes.error ?? barbersRes.error ?? linksRes.error);
    throw new AppError("unknown", "Não foi possível carregar os dados da barbearia.");
  }

  // Processa os itens da haircut_gallery com tolerância a campos opcionais
  let galleryItems = [];
  if (!galleryRes.error && Array.isArray(galleryRes.data)) {
    // Filtra apenas registros explicitamente desativados (se houver campo is_active)
    galleryItems = galleryRes.data.filter((item) => item.is_active !== false);
  } else if (galleryRes.error) {
    console.warn("[chat] Aviso ao consultar haircut_gallery:", galleryRes.error);
  }

  const rawServices = servicesRes.data ?? [];
  const processedServices = [];
  const matchedGalleryIds = new Set();

  // 1. Mapeia e enriquece os serviços existentes com as fotos da haircut_gallery
  for (const s of rawServices) {
    const matchedPhoto = findGalleryPhoto(s, galleryItems);
    let imageUrl = "";

    if (matchedPhoto) {
      matchedGalleryIds.add(matchedPhoto.id);
      const rawImg = matchedPhoto.image_path || matchedPhoto.image_url || matchedPhoto.url || matchedPhoto.photo_url || matchedPhoto.image;
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

  // 2. Se a tabela services estiver vazia ou se houver cortes na galeria cadastrados sem registro em services:
  // Inclui os cortes da galeria para garantir que toda foto cadastrada pelo admin apareça no chat
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
    services: processedServices.length ? processedServices : [...FALLBACK_SERVICES],
    barbers: barbersRes.data.length ? barbersRes.data.map((b) => ({ id: b.id, name: b.name, image: "" })) : [...FALLBACK_BARBERS],
    links: linksRes.data.map((l) => ({
      barberId: l.barber_id,
      serviceId: l.service_id,
      customDurationMinutes: l.custom_duration_minutes ?? null,
    })),
  };
}
