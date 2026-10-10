"use client";

import { useEffect, useState } from "react";
import { User } from "lucide-react";
import { selectEligibleBarbers } from "@/core/conversation/selectors";

/**
 * Avatar circular/miniatura elegante para o barbeiro:
 * - Exibe a foto real (`avatar_url` ou `image`) vinda da tabela `barbers` do Supabase.
 * - Utiliza referrerPolicy="no-referrer" e crossOrigin="anonymous" para evitar 400 ou bloqueios de CORS.
 * - Fallback gracioso com ícone de barbeiro sobre gradiente escuro caso não haja foto cadastrada.
 */
function BarberAvatar({ name, image, className = "" }) {
  const [hasError, setHasError] = useState(false);
  const cleanImage = typeof image === "string" ? image.trim() : "";

  useEffect(() => {
    setHasError(false);
  }, [cleanImage]);

  if (!cleanImage || hasError) {
    return (
      <div
        className={`rounded-full bg-gradient-to-br from-zinc-800 to-zinc-900 border border-zinc-700/70 flex items-center justify-center text-zinc-400 shrink-0 select-none shadow-inner ${className}`}
        aria-hidden="true"
      >
        <User size={24} className="text-zinc-400" />
      </div>
    );
  }

  return (
    <div className={`relative shrink-0 rounded-full overflow-hidden border-2 border-zinc-700/80 bg-zinc-900 shadow-md ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={cleanImage}
        alt={`Foto de ${name}`}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        crossOrigin="anonymous"
        onError={() => setHasError(true)}
        className="w-full h-full object-cover object-center"
      />
    </div>
  );
}

/**
 * Widget de Escolha de Barbeiro:
 * - Botões/Cards ampliados e confortáveis com foto de perfil (`avatar_url`) de cada profissional.
 * - Miniatura circular elegante com borda e efeito de seleção destacado.
 * - Área de toque expandida com feedback tátil e indicação de restrição quando aplicável.
 */
export default function BarbersWidget({ ctx, act }) {
  const eligible = new Set(selectEligibleBarbers(ctx).map((b) => b.id));

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 my-2.5">
      {ctx.catalog.barbers.map((barber) => {
        const unavailable = !eligible.has(barber.id);
        const isSelected = ctx.draft.barber?.id === barber.id;
        const avatarUrl = barber.avatar_url || barber.image || "";

        return (
          <button
            key={barber.id}
            type="button"
            disabled={unavailable}
            onClick={() => act({ type: "PICK_BARBER", id: barber.id }, barber.name)}
            className={`w-full flex items-center gap-3.5 p-3.5 sm:p-4 rounded-2xl border text-left transition-all select-none touch-manipulation cursor-pointer active:scale-[0.98] shadow-md ${
              isSelected
                ? "bg-red-950/40 border-red-500 ring-2 ring-red-500/80 shadow-red-950/50"
                : "bg-zinc-900/90 border-zinc-800 hover:border-zinc-700 hover:bg-zinc-900"
            } ${unavailable ? "opacity-40 cursor-not-allowed" : ""}`}
          >
            {/* Foto de perfil circular do profissional */}
            <BarberAvatar
              name={barber.name}
              image={avatarUrl}
              className="w-14 h-14 sm:w-16 sm:h-16"
            />

            {/* Nome e status de elegibilidade */}
            <div className="min-w-0 flex-1">
              <span className="text-[0.7rem] uppercase tracking-wider font-semibold text-zinc-500 block">
                Profissional
              </span>
              <b className="text-base sm:text-lg font-bold text-white truncate block leading-snug">
                {barber.name}
              </b>
              {unavailable ? (
                <span className="text-xs text-zinc-400 mt-0.5 block font-medium">
                  Não realiza esses serviços
                </span>
              ) : (
                <span className="text-xs text-emerald-400 mt-0.5 flex items-center gap-1 font-medium">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Disponível
                </span>
              )}
            </div>
          </button>
        );
      })}
    </div>
  );
}
