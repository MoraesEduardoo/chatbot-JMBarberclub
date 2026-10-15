"use client";

import { useEffect, useState } from "react";
import { ChevronRight, Check } from "lucide-react";
import { formatPrice } from "@/core/domain/time";

/**
 * Silhueta monocromática elegante para serviços sem foto na galeria:
 * Mantém a identidade visual refinada da barbearia sem ruído.
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
 * Componente de imagem perfeitamente integrado ao frame superior do card:
 * 1. decoding="async" e loading="lazy" para máxima performance.
 * 2. object-cover e object-top para exibir o corte/penteado sempre no enquadramento ideal.
 * 3. Fallback gracioso com a silhueta da barbearia se a imagem falhar ou não estiver cadastrada.
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
        className={`w-full h-full flex items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-zinc-950 text-zinc-500 select-none overflow-hidden ${className}`}
        aria-hidden="true"
      >
        <HaircutSilhouette className="w-16 h-16 text-zinc-400 opacity-25" />
      </div>
    );
  }

  return (
    <div className="relative w-full h-full overflow-hidden bg-zinc-950">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cleanImage}
        alt={`Foto de ${name}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onLoad={() => setIsLoaded(true)}
        onError={() => setHasError(true)}
        className={`w-full h-full object-cover object-top select-none transition-all duration-300 ${
          isLoaded ? "opacity-100 scale-100" : "opacity-0 scale-95"
        } ${className}`}
      />
      {!isLoaded && !hasError && (
        <div className="absolute inset-0 flex items-center justify-center bg-zinc-900/60 animate-pulse">
          <HaircutSilhouette className="w-12 h-12 text-zinc-600 opacity-20" />
        </div>
      )}
    </div>
  );
}

/**
 * Carrossel de Serviços com Cards Estruturados e Imagens Integradas:
 * - Imagem posicionada na área superior com aspect ratio e enquadramento perfeito (object-top).
 * - Textos e preços posicionados na área inferior, com tipografia nítida e 100% legível.
 * - Suporta seleção de múltiplos serviços com feedback visual imediato.
 */
export default function ServicesWidget({ ctx, act }) {
  const { services } = ctx.catalog;
  const selected = new Set(ctx.draft.services.map((s) => s.id));

  return (
    <div className="w-full my-2">
      <div
        className="flex gap-3 overflow-x-auto pb-3 pt-1 px-1 scrollbar-none snap-x snap-mandatory overscroll-x-contain ios-scroll-momentum"
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
              className={`relative flex-none w-[11.25rem] sm:w-[12.25rem] rounded-2xl overflow-hidden flex flex-col text-left border transition-all duration-200 snap-start select-none touch-manipulation active:scale-[0.98] cursor-pointer shadow-md group ${
                isSelected
                  ? "border-red-500 bg-zinc-900/95 shadow-xl shadow-red-500/20 ring-2 ring-red-500/60"
                  : "border-zinc-800 bg-zinc-900/75 hover:border-zinc-700 active:bg-zinc-800"
              }`}
            >
              {/* 1. Área Superior: Frame de Imagem do Corte (Proporcional e Enquadrado) */}
              <div className="relative w-full h-32 sm:h-36 bg-zinc-950 overflow-hidden flex items-center justify-center shrink-0 border-b border-zinc-800/60">
                <Picture name={service.name} image={service.image} />

                {/* Badge de Seleção / Checkmark no topo direito da imagem */}
                <div className="absolute top-2.5 right-2.5 z-10 pointer-events-none">
                  <span
                    className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-200 ${
                      isSelected
                        ? "border-red-500 bg-red-600 text-white shadow-md shadow-red-500/60 scale-105"
                        : "border-white/30 bg-black/60 backdrop-blur-md"
                    }`}
                    aria-hidden="true"
                  >
                    {isSelected ? (
                      <Check size={14} className="stroke-[3]" />
                    ) : (
                      <span className="w-1.5 h-1.5 rounded-full bg-white/40" />
                    )}
                  </span>
                </div>
              </div>

              {/* 2. Área Inferior: Informações do Serviço (Nome, Preço e Duração) */}
              <div className="p-3 flex flex-col justify-between flex-1 gap-2 bg-zinc-900/90">
                <b className="block text-sm sm:text-base font-bold text-white line-clamp-2 leading-snug tracking-tight">
                  {service.name}
                </b>

                <div className="flex items-center justify-between pt-1 border-t border-zinc-800/50 mt-auto">
                  <span className="text-emerald-400 font-bold text-xs sm:text-sm">
                    {formatPrice(service.price)}
                  </span>
                  {service.durationMinutes ? (
                    <span className="text-zinc-400 font-normal text-[0.7rem] sm:text-xs">
                      {service.durationMinutes} min
                    </span>
                  ) : null}
                </div>
              </div>
            </button>
          );
        })}

        {/* Respiro lateral final */}
        <div className="w-1.5 flex-none" aria-hidden="true" />
      </div>

      {/* Dica de navegação */}
      <p className="mt-2 flex items-center gap-1.5 text-xs text-zinc-400 select-none">
        <ChevronRight size={14} className="text-red-500 shrink-0 animate-pulse" />
        <span>Deslize para o lado para ver todos os cortes e valores</span>
      </p>
    </div>
  );
}
