"use client";

import { Crown, Sparkles, Scissors, ArrowRight, User } from "lucide-react";

/**
 * LoyaltyWidget - Card de Reconhecimento de Cliente Fiel:
 * Exibido quando o cliente possui 5+ agendamentos concluídos na mesma combinação
 * de serviço e profissional.
 * 
 * Botões de Ação:
 * 1. "Sim, agendar o de sempre" -> Pré-seleciona serviço e barbeiro e pula direto para a escolha de data/hora.
 * 2. "Escolher outro serviço" -> Inicia o fluxo normal a partir do catálogo.
 */
export default function LoyaltyWidget({ loyalty, act, client }) {
  if (!loyalty || !loyalty.isLoyal) return null;

  const clientName = (client?.name || loyalty.clientName || "Campeão").split(" ")[0].trim();
  const serviceName = loyalty.serviceName || "Corte";
  const barberName = loyalty.barberName || "seu barbeiro";
  const avatarUrl = loyalty.barberAvatar || "";

  return (
    <div className="w-full my-3 animate-fadeIn">
      <div className="rounded-[1.6rem] border border-amber-500/40 bg-gradient-to-b from-amber-500/15 via-zinc-900/95 to-zinc-950 p-4 sm:p-5 shadow-2xl shadow-amber-950/30 text-left relative overflow-hidden">
        {/* Efeito sutil de brilho no fundo */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        {/* Badge VIP */}
        <div className="flex items-center justify-between mb-3">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 border border-amber-500/40 text-amber-400 font-extrabold text-[0.7rem] uppercase tracking-wider shadow-sm">
            <Crown size={13} className="text-amber-400 fill-amber-400" />
            <span>Cliente Fiel · JM Barberclub</span>
          </span>
          <span className="text-[0.72rem] text-zinc-400 font-medium flex items-center gap-1">
            <Sparkles size={12} className="text-amber-400" />
            <span>{loyalty.totalCompleted} cortes realizados</span>
          </span>
        </div>

        {/* Saudação calorosa e personalizada */}
        <div className="space-y-1 mb-4">
          <h3 className="font-bold text-white text-base leading-snug">
            Fala, <span className="text-amber-400">{clientName}</span>! Que bom te ver de novo.
          </h3>
          <p className="text-xs text-zinc-300 leading-relaxed">
            Vai querer o seu <b className="text-white font-semibold">{serviceName}</b> de sempre com o <b className="text-white font-semibold">{barberName}</b>?
          </p>
        </div>

        {/* Card do "De Sempre" */}
        <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-950/80 border border-zinc-800/90 mb-4 shadow-inner">
          {avatarUrl ? (
            <div className="w-12 h-12 rounded-xl overflow-hidden border border-amber-500/40 shrink-0 bg-zinc-900">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={avatarUrl}
                alt={`Foto de ${barberName}`}
                className="w-full h-full object-cover object-top"
                loading="lazy"
              />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-600/30 to-zinc-900 border border-amber-500/30 grid place-items-center text-amber-400 shrink-0">
              <User size={22} />
            </div>
          )}

          <div className="min-w-0 flex-1">
            <span className="text-[0.68rem] uppercase font-bold text-amber-400 tracking-wider block">
              Seu Combo Favorito
            </span>
            <p className="font-bold text-white text-sm truncate">{serviceName}</p>
            <p className="text-xs text-zinc-400">Profissional: <span className="text-zinc-200">{barberName}</span></p>
          </div>
        </div>

        {/* Botões de Ação */}
        <div className="flex flex-col gap-2 pt-1">
          {/* Botão 1: Atalho de 1 clique - Agendar o de sempre */}
          <button
            type="button"
            onClick={() =>
              act(
                {
                  type: "REBOOK_FAVORITE",
                  serviceId: loyalty.serviceId,
                  barberId: loyalty.barberId,
                  serviceName,
                  barberName,
                },
                "Sim, agendar o de sempre"
              )
            }
            className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:brightness-110 text-zinc-950 font-extrabold text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all shadow-lg shadow-amber-500/25 select-none touch-manipulation cursor-pointer"
          >
            <Scissors size={15} className="text-zinc-950" />
            <span>Sim, agendar o de sempre</span>
          </button>

          {/* Botão 2: Escolher outro serviço */}
          <button
            type="button"
            onClick={() => act({ type: "START_BOOKING" }, "Escolher outro serviço")}
            className="w-full py-2.5 px-4 rounded-xl bg-zinc-900/90 hover:bg-zinc-800 text-zinc-300 hover:text-white font-medium text-xs flex items-center justify-center gap-2 active:scale-[0.98] transition-all border border-zinc-800 select-none touch-manipulation cursor-pointer"
          >
            <span>Escolher outro serviço</span>
            <ArrowRight size={13} className="text-zinc-400" />
          </button>
        </div>
      </div>
    </div>
  );
}
