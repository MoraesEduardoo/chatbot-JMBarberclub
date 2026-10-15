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
 * Encontra a foto ideal e exclusiva na `haircut_gallery` para um dado serviço.
 * Regras estritas de correspondência para evitar fotos repetidas entre serviços diferentes:
 * 1. Correspondência direta por ID (g.service_id === service.id).
 * 2. Correspondência exata por Título normalizado (g.title === service.name).
 * 3. Correspondência exata por Categoria normalizada (g.category === service.name).
 * 4. Correspondência estrita de títulos compostos (ex.: "Degradê + Sobrancelha" só deve casar com fotos
 *    que contenham especificamente ambos os termos, sem roubar a foto simples de "Degradê").
 * 
 * Se não houver correspondência exata e segura, retorna null para ativar o fallback limpo e elegante
 * individual em vez de repetir a foto de outro corte.
 */
/**
 * Normaliza uma string removendo caracteres especiais para comparação de chave única.
 */
export function normalizeKey(str) {
  return normalizeStr(str).replace(/[^a-z0-9]/g, "");
}

/**
 * Regras estritas de correspondência entre serviços oficiais e a galeria de cortes:
 * - Serviços com foto cadastrada recebem sua foto exclusiva.
 * - Serviços COMBO (com "+", " e ") nunca roubam fotos de serviços avulsos (ex: barba simples).
 * - Serviços avulsos (como barba simples) excluem fotos que contenham cortes completos.
 */
const SERVICE_PHOTO_RULES = {
  degrade: {
    isCombo: false,
    exactMatches: ["degrade", "degradenavalhado", "degradecabelo", "cortedegrade", "midfade", "fade"],
    keywords: ["degrade", "navalhado"],
    excludeKeywords: ["sobrancelha", "barba", "barboterapia"],
  },
  cortesotesoura: {
    isCombo: false,
    exactMatches: ["cortesotesoura", "cortesotesouro", "cortetesoura", "tesoura", "cortesotesoura100", "tesouro"],
    keywords: ["tesoura", "tesouro"],
    excludeKeywords: ["maquina", "degrade", "barba"],
  },
  lowfadeouamericano: {
    isCombo: false,
    exactMatches: ["lowfadeouamericano", "lowfade", "americano", "corteamericano", "lowfaderecorte"],
    keywords: ["lowfade", "americano"],
    excludeKeywords: ["barba", "sobrancelha"],
  },
  barboterapia: {
    isCombo: false,
    exactMatches: ["barboterapia", "terapiadebarba"],
    keywords: ["barboterapia"],
    excludeKeywords: ["corte"],
  },
  corteebarboterapia: {
    isCombo: true,
    exactMatches: ["corteebarboterapia", "cortemaisbarboterapia", "combocortebarboterapia"],
    requiredKeywords: ["corte", "barboterapia"],
  },
  cortebarbasimples: {
    isCombo: true,
    exactMatches: ["cortebarbasimples", "cortemaisbarbasimples", "corteebarba", "combocortebarba"],
    requiredKeywords: ["corte", "barba"],
  },
  barbacavanhaqueoudesignsimples: {
    isCombo: false,
    exactMatches: ["barbasimplesoucavanhaque", "barbasimples", "barbacavanhaque", "cavanhaque", "barbadesign", "barba"],
    keywords: ["cavanhaque", "barba simples"],
    excludeKeywords: ["corte", "barboterapia", "terapia"],
  },
  degradesobrancelha: {
    isCombo: true,
    exactMatches: ["degradesobrancelha", "degrademaissobrancelha", "combodegradesobrancelha"],
    requiredKeywords: ["degrade", "sobrancelha"],
  },
  socialsobrancelha: {
    isCombo: true,
    exactMatches: ["socialsobrancelha", "socialmaissobrancelha", "combosocialsobrancelha"],
    requiredKeywords: ["social", "sobrancelha"],
  },
  cortesimplesousocial: {
    isCombo: false,
    exactMatches: ["cortesocial", "cortesimples", "social", "cortesimplesousocial", "cortemasculinosocial"],
    keywords: ["social"],
    excludeKeywords: ["sobrancelha", "barba", "barboterapia", "degrade"],
  },
  limpezadepele: {
    isCombo: false,
    exactMatches: ["limpezadepele", "limpezafacial", "pele", "tratamentofacial"],
    keywords: ["limpeza", "pele"],
    excludeKeywords: ["corte", "degrade"],
  },
};

export function findGalleryPhoto(service, galleryList, usedGalleryIds = new Set()) {
  if (!galleryList?.length) return null;

  const serviceNameNorm = normalizeStr(service.name);
  const serviceKey = normalizeKey(service.name);
  const serviceId = String(service.id);

  // Considera apenas fotos ainda não associadas a outro serviço (garantia de exclusividade)
  const availableItems = galleryList.filter((g) => !usedGalleryIds.has(g.id));
  if (!availableItems.length) return null;

  // 1. Vínculo prioritário explícito por service_id se cadastrado na galeria
  const byServiceId = availableItems.find(
    (g) => g.service_id && String(g.service_id) === serviceId
  );
  if (byServiceId) return byServiceId;

  // 2. Regras estritas de correspondência por serviço oficial
  const rule = SERVICE_PHOTO_RULES[serviceKey];
  if (rule) {
    // 2.1 Correspondência exata em títulos ou categorias cadastradas
    for (const g of availableItems) {
      const gTitleKey = normalizeKey(g.title);
      const gCatKey = normalizeKey(g.category);
      if (rule.exactMatches.includes(gTitleKey) || rule.exactMatches.includes(gCatKey)) {
        return g;
      }
    }

    // 2.2 Se for serviço COMBO, exige que ambos os termos existam no título da foto
    if (rule.isCombo && rule.requiredKeywords) {
      for (const g of availableItems) {
        const normTitle = normalizeStr(g.title);
        const hasAll = rule.requiredKeywords.every((k) => normTitle.includes(k));
        if (hasAll) return g;
      }
      return null; // Combos sem foto específica não roubam fotos de serviços simples
    }

    // 2.3 Para serviços avulsos, valida keywords e bloqueia excludeKeywords
    for (const g of availableItems) {
      const normTitle = normalizeStr(g.title);
      if (rule.excludeKeywords && rule.excludeKeywords.some((ex) => normTitle.includes(ex))) {
        continue;
      }
      if (rule.keywords && rule.keywords.some((k) => normTitle.includes(k))) {
        return g;
      }
    }
  }

  // 3. Título da galeria idêntico ao nome do serviço
  const byExactTitle = availableItems.find(
    (g) => g.title && normalizeStr(g.title) === serviceNameNorm
  );
  if (byExactTitle) return byExactTitle;

  return null;
}

/**
 * Normaliza qualquer formato de dia da semana (número 0..6, 1..7 ISO, siglas ou nomes em português/inglês)
 * para o índice padrão de JavaScript: 0 = domingo ... 6 = sábado.
 */
export function normalizeDayOfWeek(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") {
    if (val >= 0 && val <= 6) return val;
    if (val === 7) return 0; // ISO Sunday = 7 -> 0
    return null;
  }
  const s = String(val).trim().toLowerCase();
  if (/^\d+$/.test(s)) {
    const n = Number(s);
    if (n >= 0 && n <= 6) return n;
    if (n === 7) return 0;
  }
  if (s.startsWith("dom") || s === "sun" || s === "sunday") return 0;
  if (s.startsWith("seg") || s === "mon" || s === "monday") return 1;
  if (s.startsWith("ter") || s === "tue" || s === "tuesday") return 2;
  if (s.startsWith("qua") || s === "wed" || s === "wednesday") return 3;
  if (s.startsWith("qui") || s === "thu" || s === "thursday") return 4;
  if (s.startsWith("sex") || s === "fri" || s === "friday") return 5;
  if (s.startsWith("sab") || s.startsWith("sáb") || s === "sat" || s === "saturday") return 6;
  return null;
}

/**
 * Constrói o mapa de expediente semanal do barbeiro a partir das linhas de `barber_schedules`.
 * Cada dia (0..6) possui status de funcionamento (is_working, closed), horário de início/fim e pausa de almoço.
 */
export function buildBarberScheduleMap(schedulesRows, barberId) {
  if (!Array.isArray(schedulesRows) || !barberId) return null;
  const barberRows = schedulesRows.filter((r) => String(r.barber_id) === String(barberId));
  if (!barberRows.length) return null;

  const map = {};
  for (const row of barberRows) {
    const day = normalizeDayOfWeek(row.day_of_week ?? row.day ?? row.weekday);
    if (day === null) continue;

    // Verificação estrita de expediente: se o barbeiro marcou o dia como folga ou inativo
    const isWorking =
      row.is_working_day !== false &&
      row.is_working !== false &&
      row.is_active !== false &&
      row.active !== false &&
      row.closed !== true &&
      row.is_closed !== true &&
      row.status !== "closed" &&
      row.status !== "fechado";

    const start = row.start_time || row.work_start || row.start || null;
    const end = row.end_time || row.work_end || row.end || null;
    const hasLunch = row.has_lunch_break !== false;
    const lunchStart = hasLunch
      ? row.lunch_start || row.break_start_time || row.break_start || row.lunchStart || null
      : null;
    const lunchEnd = hasLunch
      ? row.lunch_end || row.break_end_time || row.break_end || row.lunchEnd || null
      : null;

    map[day] = {
      is_working: isWorking,
      is_working_day: isWorking,
      closed: !isWorking,
      start: isWorking ? (start ? String(start).slice(0, 5) : "09:00") : null,
      end: isWorking ? (end ? String(end).slice(0, 5) : "19:00") : null,
      lunchStart: lunchStart ? String(lunchStart).slice(0, 5) : null,
      lunchEnd: lunchEnd ? String(lunchEnd).slice(0, 5) : null,
    };
  }

  return Object.keys(map).length > 0 ? map : null;
}

/**
 * Carrega o catálogo unificado de serviços, fotos e horários de expediente dos barbeiros para o Chatbot.
 */
export async function loadCatalog() {
  const supabase = getSupabase();
  if (!supabase) {
    return { services: [...FALLBACK_SERVICES], barbers: [...FALLBACK_BARBERS], links: [] };
  }

  // Consulta paralela das tabelas de negócio, galeria de fotos e expediente dos barbeiros
  const [servicesRes, barbersRes, linksRes, galleryRes, schedulesRes] = await Promise.all([
    supabase.from("services").select("*"),
    // Busca todas as colunas de barbers para obter avatar_url / photo_url / image_path
    supabase.from("barbers").select("*"),
    supabase.from("barber_services").select("barber_id, service_id, custom_duration_minutes"),
    // Busca dados da tabela haircut_gallery sem filtros restritivos
    supabase.from("haircut_gallery").select("*"),
    // Consulta a tabela oficial de expediente e folgas dos profissionais
    supabase.from("barber_schedules").select("*"),
  ]);

  // Se houver falha crítica nas tabelas estruturais de agendamento
  if (servicesRes.error || barbersRes.error || linksRes.error) {
    console.error("[chat] falha ao carregar tabelas principais:", servicesRes.error ?? barbersRes.error ?? linksRes.error);
    throw new AppError("unknown", "Não foi possível carregar os dados da barbearia.");
  }

  // Tolerância a variações no nome da tabela de expediente (barber_schedules vs barber_schedule)
  let schedulesRows = [];
  if (!schedulesRes.error && Array.isArray(schedulesRes.data)) {
    schedulesRows = schedulesRes.data;
  } else if (schedulesRes.error) {
    try {
      const altRes = await supabase.from("barber_schedule").select("*");
      if (!altRes.error && Array.isArray(altRes.data)) {
        schedulesRows = altRes.data;
      }
    } catch {
      // Ignora erro se a tabela alternativa também não existir
    }
  }

  // Processa os itens da haircut_gallery com tolerância a campos opcionais
  let galleryItems = [];
  if (!galleryRes.error && Array.isArray(galleryRes.data)) {
    galleryItems = galleryRes.data.filter((item) => item.is_active !== false);
  } else if (galleryRes.error) {
    console.warn("[chat] Aviso ao consultar haircut_gallery:", galleryRes.error);
  }

  const rawServices = servicesRes.data ?? [];
  const processedServices = [];
  const matchedGalleryIds = new Set();

  // 1. Mapeia e enriquece os serviços existentes com as fotos da haircut_gallery (1 foto única por serviço)
  for (const s of rawServices) {
    const matchedPhoto = findGalleryPhoto(s, galleryItems, matchedGalleryIds);
    let imageUrl = "";

    if (matchedPhoto) {
      matchedGalleryIds.add(matchedPhoto.id);
      const rawImg = matchedPhoto.image_path || matchedPhoto.image_url || matchedPhoto.url || matchedPhoto.photo_url || matchedPhoto.image;
      imageUrl = resolveHaircutImageUrl(supabase, rawImg);
    }

    const rawPrice = Number(s.price || 0);
    const normalizedPrice = rawPrice >= 100 ? rawPrice / 100 : rawPrice;

    processedServices.push({
      id: s.id,
      name: s.name,
      price: normalizedPrice,
      durationMinutes: s.duration_minutes ?? s.default_duration_minutes ?? 30,
      image: imageUrl,
      restricted: RESTRICTED_SERVICE_NAMES.includes(s.name),
    });
  }

  // 2. Se a tabela services estiver vazia ou se houver cortes na galeria cadastrados sem registro em services
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

  // Mapeia os barbeiros garantindo a foto de perfil (avatar_url) e a escala de expediente individual (schedules)
  const processedBarbers = barbersRes.data?.length
    ? barbersRes.data.map((b) => {
        const rawAvatar = b.avatar_url || b.photo_url || b.image_url || b.image_path || b.image || "";
        const fallbackBarber = FALLBACK_BARBERS.find(
          (fb) => fb.id === b.id || fb.name.toLowerCase() === b.name?.toLowerCase()
        );
        const dbSchedule = buildBarberScheduleMap(schedulesRows, b.id);
        const schedule = dbSchedule ?? fallbackBarber?.schedules ?? null;

        return {
          id: b.id,
          name: b.name,
          image: rawAvatar ? resolveHaircutImageUrl(supabase, rawAvatar) : "",
          avatar_url: rawAvatar ? resolveHaircutImageUrl(supabase, rawAvatar) : "",
          schedules: schedule,
          schedule: schedule,
        };
      })
    : [...FALLBACK_BARBERS];

  return {
    services: processedServices.length ? processedServices : [...FALLBACK_SERVICES],
    barbers: processedBarbers,
    links: linksRes.data.map((l) => ({
      barberId: l.barber_id,
      serviceId: l.service_id,
      customDurationMinutes: l.custom_duration_minutes ?? null,
    })),
  };
}
