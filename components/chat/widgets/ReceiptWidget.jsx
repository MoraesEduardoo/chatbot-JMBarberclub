"use client";

import { useState } from "react";
import { Bell, BellRing, Check, Clock, Loader2, Sparkles, User } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Comprovante do agendamento com ativação estratégica de Notificações Push:
 * - Card de confirmação refinado no estilo de aplicativo nativo (rounded-[1.75rem], p-6 sm:p-7).
 * - Botão "Ativar Lembretes" mantido no tom dourado/amarelo da marca, harmonizando com os tons escuros
 *   e o vermelho vivo dos botões principais de ação.
 */
export default function ReceiptWidget({ summary, client }) {
  const { isSupported, permission, isSubscribed, isLoading, subscribeToPush } = usePushNotifications();
  const [activatedNow, setActivatedNow] = useState(false);

  const handleActivatePush = async () => {
    const result = await subscribeToPush(client);
    if (result?.success) {
      setActivatedNow(true);
    }
  };

  const hasSubscribed = isSubscribed || activatedNow;

  return (
    <div className="mt-3.5 space-y-3.5">
      {/* Cartão principal do comprovante — Amplo respiro e cantos arredondados nativos */}
      <div className="rounded-[1.75rem] border border-zinc-800 bg-gradient-to-b from-zinc-900/95 via-zinc-950 to-zinc-950 p-6 sm:p-7 text-center select-text shadow-2xl shadow-black/60 transition-all">
        {/* Ícone de Sucesso */}
        <div className="mx-auto mb-3.5 h-12 w-12 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400 grid place-items-center shadow-lg shadow-emerald-500/10">
          <Check size={24} className="stroke-[2.5]" />
        </div>

        <span className="text-[0.7rem] uppercase font-bold tracking-widest text-emerald-400 block mb-1">
          Agendamento Confirmado
        </span>
        <h3 className="font-extrabold text-white text-lg sm:text-xl leading-snug">
          {summary.serviceNames}
        </h3>

        {/* Detalhes do profissional e horário com amplo espaçamento */}
        <div className="my-4 py-3 px-4 rounded-2xl bg-zinc-900/70 border border-zinc-800/80 space-y-2 text-left">
          <div className="flex items-center gap-2.5 text-xs text-zinc-300">
            <User size={14} className="text-zinc-400 shrink-0" />
            <span>
              Barbeiro: <b className="text-white font-semibold">{summary.barberName}</b>
            </span>
          </div>
          <div className="flex items-center gap-2.5 text-xs text-zinc-300">
            <Clock size={14} className="text-red-400 shrink-0" />
            <span>
              Data: <b className="text-white font-semibold">{summary.dateText}</b> às{" "}
              <b className="text-red-400 font-bold">{summary.time}</b>
            </span>
          </div>
        </div>

        {/* Total a pagar */}
        <div className="border-t border-zinc-800/80 pt-3.5 flex items-center justify-between text-xs">
          <span className="font-semibold uppercase tracking-wider text-zinc-400">Total</span>
          <span className="text-lg font-black text-emerald-400 tabular-nums">
            {summary.totalText}
          </span>
        </div>
      </div>

      {/* Convite amigável e estratégico para Ativação de Notificações Push (Tom Dourado Harmônico) */}
      {isSupported && permission !== "denied" && (
        <div className="overflow-hidden rounded-2xl border border-amber-500/35 bg-gradient-to-r from-amber-500/10 via-zinc-900/90 to-zinc-950 p-4 sm:p-5 shadow-xl shadow-amber-950/20 text-left transition-all">
          {hasSubscribed ? (
            <div className="flex items-center gap-3 text-xs text-emerald-400 font-medium">
              <span className="h-9 w-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 grid place-items-center shrink-0">
                <BellRing size={17} className="text-emerald-400" />
              </span>
              <div>
                <p className="font-bold text-white text-sm">Lembretes ativados com sucesso!</p>
                <p className="text-xs text-zinc-400 mt-0.5">
                  Avisaremos você no seu celular antes do seu horário com {summary.barberName}.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start gap-3">
                <div className="h-9 w-9 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 grid place-items-center shrink-0 shadow-inner">
                  <Bell size={18} />
                </div>
                <div className="min-w-0 pr-1">
                  <div className="flex items-center gap-1.5">
                    <p className="font-bold text-xs sm:text-sm text-white">Lembrete de Horário</p>
                    <Sparkles size={12} className="text-amber-400 shrink-0" />
                  </div>
                  <p className="text-xs text-zinc-300 mt-1 leading-relaxed">
                    Deseja receber um aviso no celular antes do seu horário para não esquecer o corte?
                  </p>
                </div>
              </div>

              <div className="mt-3.5 flex justify-end pt-2 border-t border-zinc-800/60">
                <button
                  type="button"
                  onClick={handleActivatePush}
                  disabled={isLoading}
                  className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-amber-400 via-amber-500 to-yellow-500 px-4 py-2.5 text-xs font-bold text-zinc-950 shadow-lg shadow-amber-500/25 hover:brightness-105 active:scale-95 transition-all select-none touch-manipulation disabled:opacity-50 min-h-[42px] cursor-pointer"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={14} className="animate-spin text-zinc-950" />
                      <span>Ativando…</span>
                    </>
                  ) : (
                    <>
                      <BellRing size={14} className="text-zinc-950" />
                      <span>Ativar Lembretes</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
