"use client";

import { Clock3, Calendar as CalendarIcon } from "lucide-react";
import { selectBookableDays, selectSlots } from "@/core/conversation/selectors";
import { MONTHS_SHORT, WEEKDAYS_SHORT, formatDateLong, todayKey, weekdayOf } from "@/core/domain/time";

/**
 * DatesWidget Unificado (Fluxo Contínuo de Data e Horários):
 * - Ao selecionar um dia no carrossel, a grade de horários disponíveis
 *   é exibida imediatamente logo abaixo em um único fluxo contínuo e rápido.
 * - Elimina a sensação de "etapas separadas em excesso" apontada pelo cliente.
 * - Permite trocar de dia livremente tocando em outra data, atualizando os horários na hora.
 */
export default function DatesWidget({ ctx, act }) {
  const today = todayKey(ctx.now);
  const selectedDateKey = ctx.draft?.dateKey;
  const isDateSelected = Boolean(selectedDateKey);

  // Status da disponibilidade e horários filtrados (sem horários passados)
  const { status } = ctx.availability || { status: "idle" };
  const slots = isDateSelected
    ? selectSlots(ctx).filter((slot) => slot.reason !== "past")
    : [];

  return (
    <div className="w-full my-2 space-y-4">
      {/* 1. Carrossel de Seleção de Datas */}
      <div>
        <p className="mb-2 flex items-center gap-1.5 text-xs text-zinc-400 font-medium">
          <CalendarIcon size={14} className="text-red-400" />
          <span>Escolha o dia preferido:</span>
        </p>

        <div className="date-carousel ios-scroll-momentum py-1">
          {selectBookableDays(ctx).map((key) => {
            const [, month, day] = key.split("-").map(Number);
            const isSelected = selectedDateKey === key;

            return (
              <button
                key={key}
                type="button"
                onClick={() => act({ type: "PICK_DATE", date: key }, formatDateLong(key))}
                className={`date-card select-none touch-manipulation transition-all active:scale-[0.95] cursor-pointer shadow-md ${
                  isSelected ? "selected ring-2 ring-red-500 border-red-500 scale-[1.03]" : ""
                }`}
              >
                <span className={isSelected ? "text-red-400 font-bold" : ""}>
                  {key === today ? "HOJE" : WEEKDAYS_SHORT[weekdayOf(key)]}
                </span>
                <b className="text-xl sm:text-2xl font-black">{day}</b>
                <small className="uppercase font-semibold tracking-wider">
                  {MONTHS_SHORT[month - 1]}
                </small>
              </button>
            );
          })}
        </div>

        <p className="mt-1.5 text-[0.72rem] text-zinc-500">
          Deslize para o lado para ver todos os dias disponíveis.
        </p>
      </div>

      {/* 2. Seção de Horários Imediata para o Dia Escolhido (Fluxo Unificado) */}
      {isDateSelected && (
        <div className="pt-3 border-t border-zinc-800/80 animate-fadeIn">
          <div className="flex items-center justify-between mb-2.5">
            <p className="flex items-center gap-1.5 text-xs text-zinc-300 font-semibold">
              <Clock3 size={14} className="text-red-400" />
              <span>Horários para <b className="text-white font-bold">{formatDateLong(selectedDateKey)}</b>:</span>
            </p>
            {status === "loading" && (
              <span className="text-[0.7rem] text-red-400 animate-pulse font-medium">
                Carregando…
              </span>
            )}
          </div>

          {status === "loading" && (
            <div className="py-6 flex items-center justify-center">
              <p className="text-zinc-400 text-xs animate-pulse flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500 animate-ping" />
                Consultando disponibilidade em tempo real…
              </p>
            </div>
          )}

          {status === "error" && (
            <div className="p-3.5 rounded-2xl bg-zinc-900 border border-red-900/40 text-center">
              <p className="text-xs text-zinc-400 mb-2">Não consegui consultar os horários deste dia.</p>
              <button
                type="button"
                onClick={() => act({ type: "RETRY_AVAILABILITY" })}
                className="px-4 py-2 rounded-xl bg-zinc-800 text-white text-xs font-semibold hover:bg-zinc-700 active:scale-95 transition-all"
              >
                Tentar novamente
              </button>
            </div>
          )}

          {status === "ready" && slots.length === 0 && (
            <div className="p-4 rounded-2xl bg-zinc-900 border border-zinc-800 text-center">
              <p className="text-xs text-zinc-400">
                Nenhum horário livre restante neste dia. Por favor, escolha outra data acima.
              </p>
            </div>
          )}

          {status === "ready" && slots.length > 0 && (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2.5 my-1">
              {slots.map((slot) => {
                const isSelected = ctx.draft?.time === slot.time;
                return (
                  <button
                    key={slot.time}
                    type="button"
                    disabled={!slot.available}
                    onClick={() => act({ type: "PICK_TIME", time: slot.time }, slot.time)}
                    className={`time-button select-none touch-manipulation transition-all cursor-pointer shadow-sm min-h-[44px] ${
                      isSelected ? "selected ring-2 ring-red-500 bg-red-600/20 text-white font-bold" : ""
                    } ${!slot.available ? "opacity-30 line-through cursor-not-allowed bg-zinc-950/60" : ""}`}
                  >
                    {slot.reason === "booked" ? "Ocupado" : slot.time}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
