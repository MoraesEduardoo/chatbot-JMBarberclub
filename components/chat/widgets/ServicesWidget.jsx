import { useEffect, useState } from "react";
import { ChevronRight, Scissors } from "lucide-react";
import { formatPrice } from "@/core/domain/time";

/**
 * Componente de imagem blindado para renderizar as fotos reais da `haircut_gallery`:
 * 1. decoding="async": impede travamentos na thread principal de renderização no Safari/WebKit.
 * 2. loading="lazy": economiza consumo de banda e memória em dispositivos móveis.
 * 3. referrerPolicy="no-referrer": impede bloqueios de CORS/Referer ao carregar imagens do Supabase Storage.
 * 4. crossOrigin="anonymous": permite acesso limpo a ativos de CDN externos.
 * 5. Tratamento de Erro 400 (Bad Request) / 404: Se o link da foto estiver corrompido, vazio
 *    ou o Supabase Storage rejeitar o caminho, o evento onError ativa imediatamente um
 *    fallback padrão (placeholder) estilizado com a identidade visual da barbearia,
 *    garantindo que o card nunca quebre visualmente nem exiba ícones quebrados do navegador.
 */
export function Picture({ name, image, className = "" }) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  // Reseta estado de erro se a propriedade de imagem mudar dinamicamente
  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [image]);

  const cleanImage = typeof image === "string" ? image.trim() : "";

  if (!cleanImage || hasError) {
    return (
      <div
        className={`absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-br from-zinc-800/90 via-zinc-900/95 to-zinc-950 text-zinc-500 z-0 select-none ${className}`}
        aria-hidden="true"
      >
        <div className="w-10 h-10 rounded-full bg-zinc-900/90 border border-zinc-800 flex items-center justify-center mb-1.5 shadow-inner">
          <Scissors size={18} className="text-zinc-500 rotate-45" />
        </div>
        <span className="text-[10px] tracking-widest uppercase font-semibold text-zinc-500/90">
          JM Barber
        </span>
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={cleanImage}
      alt={name}
      loading="lazy"
      decoding="async"
      referrerPolicy="no-referrer"
      crossOrigin="anonymous"
      onLoad={() => setIsLoaded(true)}
      onError={() => {
        // Ativa o fallback resiliente instantaneamente para evitar quebra de UI
        setHasError(true);
      }}
      className={`absolute inset-0 w-full h-full object-cover z-0 transition-opacity duration-300 select-none ${
        isLoaded ? "opacity-75 sm:opacity-80" : "opacity-0"
      } ${className}`}
    />
  );
}

/**
 * Carrossel Horizontal de Serviços (Mobile-First / iOS Swiper):
 * - Alinhamento flexbox horizontal contínuo (`flex overflow-x-auto`)
 * - Suporte nativo ao WebKit do iPhone com rolagem suave por inércia (`-webkit-overflow-scrolling: touch`)
 * - Ponto de parada magnético (`scroll-snap-type: x mandatory` / `snap-start`) para fixação de cada card
 * - Margem de respiro lateral (padding) para que o primeiro e último card não fiquem colados
 */
export default function ServicesWidget({ ctx, act }) {
  const { services } = ctx.catalog;
  const selected = new Set(ctx.draft.services.map((s) => s.id));

  return (
    <div className="w-full my-2">
      {/* 
        Container de rolagem lateral (Swiper Horizontal):
        - flex: alinha os cartões lado a lado em linha única
        - overflow-x-auto: ativa a rolagem horizontal
        - scrollbar-none: remove barra de rolagem visualmente poluída
        - snap-x snap-mandatory: alinhamento magnético ao deslizar
        - overscroll-contain: impede que o scroll horizontal acione o efeito elástico vertical da tela
      */}
      <div
        className="flex gap-3 overflow-x-auto pb-3 pt-1 px-1 scrollbar-none snap-x snap-mandatory overscroll-x-contain ios-scroll-momentum"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {services.map((service, index) => {
          const isSelected = selected.has(service.id);
          return (
            <button
              key={service.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => act({ type: "TOGGLE_SERVICE", id: service.id })}
              /* 
                Estrutura do Card no Carrossel:
                - flex-none / w-[10.5rem] (168px): largura expandida e ergonômica para toque com o polegar
                - h-44 (176px): altura ampliada garantindo legibilidade e presença visual sem poluição
                - snap-start: cada cartão alinha magneticamente ao início ao soltar o dedo
                - touch-manipulation & active:scale-[0.97]: feedback tátil instantâneo no iPhone
              */
              className={`relative flex-none w-[10.5rem] sm:w-[11.5rem] h-44 overflow-hidden rounded-2xl p-3.5 flex flex-col justify-between text-left border transition-all snap-start select-none touch-manipulation active:scale-[0.97] cursor-pointer shadow-md ${
                isSelected
                  ? "border-red-500 bg-zinc-900/90 shadow-xl shadow-red-500/25 ring-2 ring-red-500"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 active:bg-zinc-800/80"
              }`}
            >
              {/* Imagem de fundo com carregamento assíncrono e tratamento de erro WebKit */}
              <Picture name={service.name} image={service.image} />

              {/* Gradiente escuro para legibilidade tipográfica superior */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/50 to-black/30 z-[1] pointer-events-none" />

              {/* Topo do card (Número de referência rápida e indicador circular de seleção) */}
              <div className="relative z-10 flex justify-between items-start w-full pointer-events-none">
                <span className="grid place-items-center w-6 h-6 rounded-full bg-black/80 text-xs font-bold text-white border border-zinc-700 shadow">
                  {index + 1}
                </span>
                <span
                  className={`w-5 h-5 rounded-full border grid place-items-center transition-colors ${
                    isSelected ? "border-red-500 bg-red-500 text-white shadow-sm shadow-red-500" : "border-zinc-600 bg-black/50"
                  }`}
                >
                  {isSelected && <span className="w-2 h-2 rounded-full bg-white" />}
                </span>
              </div>

              {/* Rodapé do card (Nome, Preço e Duração estimada) */}
              <div className="relative z-10 mt-auto pointer-events-none">
                <b className="block text-sm sm:text-base font-bold text-white drop-shadow-md truncate leading-tight">
                  {service.name}
                </b>
                <small className="text-xs sm:text-sm text-zinc-300 drop-shadow-md mt-1 block font-semibold text-emerald-400">
                  {formatPrice(service.price)}
                  {service.durationMinutes ? (
                    <span className="text-zinc-400 font-normal"> · {service.durationMinutes} min</span>
                  ) : ""}
                </small>
              </div>
            </button>
          );
        })}
      </div>

      {/* Dica visual de navegação tátil mobile */}
      <p className="mt-1 flex items-center gap-1 text-[0.7rem] text-zinc-400 select-none">
        <ChevronRight size={12} className="text-red-400 shrink-0" />
        <span>Deslize para o lado para ver todos os cortes e valores</span>
      </p>
    </div>
  );
}
