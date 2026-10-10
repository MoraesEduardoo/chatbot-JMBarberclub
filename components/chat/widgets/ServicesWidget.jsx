import { useEffect, useState } from "react";
import { ChevronRight } from "lucide-react";
import { formatPrice } from "@/core/domain/time";

/**
 * Silhueta monocromática elegante para cortes sem foto na galeria:
 * Substitui o ícone genérico e textos poluídos por uma marca d'água sutil
 * com opacidade reduzida, preservando a identidade visual da barbearia
 * e mantendo o foco total no nome e no preço do serviço.
 */
function HaircutSilhouette({ className = "" }) {
  return (
    <svg
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      {/* Contorno artístico de perfil masculino com corte degradê / fade */}
      <path
        d="M32 9C23.8 9 17.8 14.7 16.2 22.8C15.1 28.1 16.7 33.5 19.6 37.4C20.5 38.6 20.9 40 20.7 41.4C20.1 45.8 19.4 50.3 18.9 54.8C22.8 57.4 27.2 58.7 32 58.7C36.8 58.7 41.2 57.4 45.1 54.8C44.6 50.3 43.9 45.8 43.3 41.4C43.1 40 43.5 38.6 44.4 37.4C47.3 33.5 48.9 28.1 47.8 22.8C46.2 14.7 40.2 9 32 9Z"
        fill="currentColor"
        fillOpacity="0.35"
      />
      <path
        d="M32 13C26 13 21.4 17.1 20.1 23C19.2 27 20.5 31.1 22.8 34.3C23.9 35.8 24.3 37.6 24 39.4L23.5 42.9C26.1 44 28.9 44.6 32 44.6C35.1 44.6 37.9 44 40.5 42.9L40 39.4C39.7 37.6 40.1 35.8 41.2 34.3C43.5 31.1 44.8 27 43.9 23C42.6 17.1 38 13 32 13Z"
        fill="currentColor"
        fillOpacity="0.65"
      />
      <path
        d="M25.5 20.5C26.4 16.4 28.9 13.8 32 13.8C35.1 13.8 37.6 16.4 38.5 20.5C35.8 18.8 33.1 18.2 32 18.2C30.9 18.2 28.2 18.8 25.5 20.5Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * Componente de imagem blindado para renderizar as fotos reais da `haircut_gallery`:
 * 1. decoding="async": impede travamentos na thread de renderização WebKit/iOS.
 * 2. loading="lazy": economiza dados e memória móvel.
 * 3. referrerPolicy="no-referrer" & crossOrigin="anonymous": garante carregamento limpo do Supabase Storage.
 * 4. Fallback com Silhueta Monocromática Elegante: Se a foto falhar ou não existir, exibe a silhueta
 *    com opacidade reduzida sobre gradiente escuro refinado, sem ruídos ou textos competindo com a UI.
 */
export function Picture({ name, image, className = "" }) {
  const [hasError, setHasError] = useState(false);
  const [isLoaded, setIsLoaded] = useState(false);

  useEffect(() => {
    setHasError(false);
    setIsLoaded(false);
  }, [image]);

  const cleanImage = typeof image === "string" ? image.trim() : "";

  if (!cleanImage || hasError) {
    return (
      <div
        className={`absolute inset-0 flex items-center justify-center bg-gradient-to-b from-zinc-800/80 via-zinc-900 to-zinc-950 text-zinc-400 select-none overflow-hidden ${className}`}
        aria-hidden="true"
      >
        {/* Silhueta monocromática elegante com opacidade reduzida no fundo */}
        <div className="absolute inset-0 flex items-center justify-center -translate-y-3 pointer-events-none">
          <HaircutSilhouette className="w-24 h-24 text-zinc-400 opacity-20 transition-transform duration-300" />
        </div>
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
        isLoaded ? "opacity-80 sm:opacity-85" : "opacity-0"
      } ${className}`}
    />
  );
}

/**
 * Carrossel Horizontal de Serviços (Mobile-First / iOS Swiper):
 * - Remoção de ruído visual: números ordinais "1" e "2" removidos; foco na foto e no corte.
 * - Tipografia e contraste reforçados: gradiente escuro estendido + badge de preço nítido.
 * - Silhueta elegante no fallback de fotos ausentes com opacidade suave.
 * - Deslizamento fluido com scroll-snap magnético e respiro ergonômico no mobile.
 */
export default function ServicesWidget({ ctx, act }) {
  const { services } = ctx.catalog;
  const selected = new Set(ctx.draft.services.map((s) => s.id));

  return (
    <div className="w-full my-2">
      {/* 
        Container de rolagem lateral (Swiper Horizontal Mobile):
        - flex horizontal com gap confortável entre os cartões
        - snap-x snap-mandatory para parada magnética suave em cada card
        - scrollbar oculta e inércia nativa WebKit (-webkit-overflow-scrolling: touch)
      */}
      <div
        className="flex gap-3.5 overflow-x-auto pb-3 pt-1 px-1 scrollbar-none snap-x snap-mandatory overscroll-x-contain ios-scroll-momentum"
        style={{
          WebkitOverflowScrolling: "touch",
          scrollbarWidth: "none",
          msOverflowStyle: "none",
        }}
      >
        {services.map((service) => {
          const isSelected = selected.has(service.id);
          return (
            <button
              key={service.id}
              type="button"
              aria-pressed={isSelected}
              onClick={() => act({ type: "TOGGLE_SERVICE", id: service.id })}
              /* 
                Estrutura do Card no Carrossel:
                - Largura ampliada e altura ergonômica (h-48) para toque confortável com o polegar
                - snap-start para alinhamento instantâneo
                - Borda vermelha viva da marca com brilho sutil quando selecionado
              */
              className={`relative flex-none w-[10.75rem] sm:w-[11.75rem] h-48 overflow-hidden rounded-2xl p-3.5 flex flex-col justify-between text-left border transition-all duration-200 snap-start select-none touch-manipulation active:scale-[0.98] cursor-pointer shadow-md group ${
                isSelected
                  ? "border-red-500 bg-zinc-900/90 shadow-xl shadow-red-500/25 ring-2 ring-red-500/50"
                  : "border-zinc-800 bg-zinc-900/60 hover:border-zinc-700 active:bg-zinc-800/80"
              }`}
            >
              {/* Imagem de fundo real da galeria ou silhueta minimalista elegante */}
              <Picture name={service.name} image={service.image} />

              {/* Gradiente escuro aprimorado para legibilidade e contraste superior */}
              <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/65 to-black/20 z-[1] pointer-events-none" />

              {/* 
                Topo do card: 
                - Numeração '1' e '2' removida conforme diretriz visual.
                - Indicador circular limpo alinhado à direita para feedback de seleção.
              */}
              <div className="relative z-10 flex justify-end items-start w-full pointer-events-none">
                <span
                  className={`w-5 h-5 rounded-full border grid place-items-center transition-all duration-200 ${
                    isSelected
                      ? "border-red-500 bg-red-600 text-white shadow-md shadow-red-500/50 scale-105 ring-2 ring-red-400/30"
                      : "border-white/30 bg-black/40 backdrop-blur-sm"
                  }`}
                  aria-hidden="true"
                >
                  {isSelected && <span className="w-2 h-2 rounded-full bg-white shadow-sm" />}
                </span>
              </div>

              {/* Rodapé do card: Nome com drop-shadow nítido e badge de preço destacado */}
              <div className="relative z-10 mt-auto pointer-events-none space-y-1.5">
                <b className="block text-sm sm:text-base font-bold text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.9)] line-clamp-2 leading-snug tracking-tight">
                  {service.name}
                </b>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-black/70 backdrop-blur-md border border-white/10 text-emerald-400 font-semibold text-xs sm:text-sm drop-shadow-md">
                  <span>{formatPrice(service.price)}</span>
                  {service.durationMinutes ? (
                    <>
                      <span className="text-zinc-500 font-light text-[0.65rem]">·</span>
                      <span className="text-zinc-300 font-normal text-[0.7rem] sm:text-xs">
                        {service.durationMinutes} min
                      </span>
                    </>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}

        {/* Respiro lateral final para que o último card não cole na borda da tela */}
        <div className="w-1.5 flex-none" aria-hidden="true" />
      </div>

      {/* Dica visual de navegação tátil mobile com seta pulsante suave */}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400 select-none">
        <ChevronRight size={14} className="text-red-500 shrink-0 animate-pulse" />
        <span>Deslize para o lado para ver todos os cortes e valores</span>
      </p>
    </div>
  );
}
