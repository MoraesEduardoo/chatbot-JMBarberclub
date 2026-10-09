"use client";

import { Calendar, Check, Clock, Scissors, User } from "lucide-react";
import { selectSummary } from "@/core/conversation/selectors";

/**
 * Card de Resumo do Agendamento (Refatorado para UI Mobile-First de Alta Conversão):
 * 1. Espaçamento Interno Ampliado (p-6 sm:p-7):
 *    - Amplo respiro visual entre as informações do corte (serviço, barbeiro, data/hora) e as bordas.
 * 2. Arredondamento Nativo (rounded-3xl / rounded-[1.75rem]):
 *    - Estilo suave e moderno de card de aplicativo nativo iOS/PWA com bordas sutis e sombra profunda.
 * 3. Botão "Confirmar" Padronizado no Vermelho Vivo da Marca:
 *    - Fundo vermelho vibrante (#dc2626 / gradient red-600 to rose-600) idêntico aos botões primários
 *      e ícones de topo, com texto em branco de alto contraste e ícone de check.
 */
export default function SummaryWidget({ ctx, act }) {
  const s = selectSummary(ctx);

  return (
    <div className="w-full my-3 space-y-3">
      {/* Card escuro de resumo refinado com padding generoso e cantos arredondados modernos */}
      <div className="rounded-[1.75rem] border border-zinc-800 bg-gradient-to-b from-zinc-900/95 via-zinc-950 to-zinc-950 p-6 sm:p-7 shadow-2xl shadow-black/60 select-text transition-all">
        {/* Cabeçalho do Card com ícone da marca e tempo estimado */}
        <div className="flex items-center justify-between pb-4 border-b border-zinc-800/80">
          <div className="flex items-center gap-2.5">
            <span className="h-8 w-8 rounded-xl bg-red-600/20 text-red-500 grid place-items-center shadow-inner">
              <Scissors size={16} />
            </span>
            <span className="text-xs font-bold uppercase tracking-wider text-zinc-300">
              Resumo do Corte
            </span>
          </div>
          {s.durationMinutes > 0 && (
            <span className="text-xs font-medium text-zinc-400 bg-zinc-900/90 px-2.5 py-1 rounded-full border border-zinc-800 flex items-center gap-1.5">
              <Clock size={12} className="text-red-400" />
              {s.durationMinutes} min
            </span>
          )}
        </div>

        {/* Informações detalhadas com espaçamento e hierarquia tipográfica clara */}
        <div className="py-5 space-y-4">
          {s.previous && (
            <div className="rounded-2xl bg-zinc-900/80 border border-zinc-800/80 p-3 text-xs">
              <span className="text-zinc-500 block font-medium mb-0.5">Horário anterior:</span>
              <s className="text-zinc-400">{s.previous.dateText} às {s.previous.time}</s>
            </div>
          )}

          {/* Nome do Serviço em destaque */}
          <div>
            <span className="text-[0.7rem] uppercase font-bold text-zinc-500 tracking-widest block mb-1">
              Serviço Selecionado
            </span>
            <p className="text-lg sm:text-xl font-extrabold text-white leading-snug">
              {s.serviceNames}
            </p>
          </div>

          {/* Linhas de detalhes: Barbeiro e Horário */}
          <div className="grid grid-cols-1 gap-3 pt-1">
            {/* Barbeiro Responsável */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/60">
              <div className="h-8 w-8 rounded-xl bg-zinc-800 grid place-items-center text-zinc-400 shrink-0">
                <User size={15} />
              </div>
              <div className="min-w-0">
                <span className="text-[0.68rem] uppercase font-semibold text-zinc-500 block leading-tight">
                  Profissional
                </span>
                <p className="text-sm font-bold text-white truncate leading-snug">
                  {s.barberName}
                </p>
              </div>
            </div>

            {/* Data e Horário com ícone de calendário */}
            <div className="flex items-center gap-3 p-3 rounded-2xl bg-zinc-900/60 border border-zinc-800/60">
              <div className="h-8 w-8 rounded-xl bg-red-600/15 grid place-items-center text-red-400 shrink-0">
                <Calendar size={15} />
              </div>
              <div className="min-w-0">
                <span className="text-[0.68rem] uppercase font-semibold text-zinc-500 block leading-tight">
                  Data & Horário
                </span>
                <p className="text-sm text-zinc-200 leading-snug">
                  <b className="text-white font-bold">{s.dateText}</b> às{" "}
                  <b className="text-red-400 font-extrabold">{s.time}</b>
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Rodapé do Card com Valor Total */}
        <div className="pt-4 border-t border-zinc-800/80 flex items-center justify-between">
          <span className="text-xs font-bold uppercase tracking-wider text-zinc-400">
            Total a pagar
          </span>
          <span className="text-xl sm:text-2xl font-black text-emerald-400 tracking-tight tabular-nums">
            {s.totalText}
          </span>
        </div>

        {/* Botão de Ação Primária "Confirmar" padronizado no Vermelho Vivo da Marca */}
        <button
          type="button"
          onClick={() => act?.({ type: "CONFIRM_BOOKING" }, "Confirmar")}
          className="w-full mt-5 flex items-center justify-center gap-2.5 py-4 px-6 rounded-2xl bg-gradient-to-r from-red-600 via-red-600 to-rose-600 text-white font-bold text-sm shadow-xl shadow-red-600/35 hover:brightness-110 active:scale-[0.98] transition-all border border-red-500/50 select-none touch-manipulation cursor-pointer min-h-[48px]"
        >
          <Check size={20} className="stroke-[2.5]" />
          <span>Confirmar Agendamento</span>
        </button>
      </div>
    </div>
  );
}
