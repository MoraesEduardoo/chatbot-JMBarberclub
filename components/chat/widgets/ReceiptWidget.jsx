"use client";

import { useState } from "react";
import { Bell, BellRing, Check, Loader2, Sparkles } from "lucide-react";
import { usePushNotifications } from "@/hooks/usePushNotifications";

/**
 * Comprovante do agendamento com ativação estratégica de Notificações Push:
 * - O pedido de permissão e o registro na tabela `push_subscriptions` ocorrem
 *   logo após o agendamento ser concluído com sucesso, proporcionando a melhor taxa de conversão.
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
    <div className="mt-3 space-y-2.5">
      {/* Cartão principal do comprovante */}
      <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-center select-text shadow-sm">
        <span className="mx-auto mb-2 h-10 w-10 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center">
          <Check size={20} />
        </span>
        <p className="font-semibold text-white text-base">{summary.serviceNames}</p>
        <p className="text-sm text-zinc-300">com {summary.barberName}</p>
        <p className="mt-1 text-sm text-zinc-300 font-medium">
          {summary.dateText} às {summary.time}
        </p>
        <p className="mt-2 text-xs text-zinc-400 border-t border-zinc-800 pt-2 font-semibold">
          Total: <span className="text-emerald-400">{summary.totalText}</span>
        </p>
      </div>

      {/* Convite amigável e estratégico para Ativação de Notificações Push */}
      {isSupported && permission !== "denied" && (
        <div className="overflow-hidden rounded-2xl border border-amber-500/30 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 p-3.5 shadow-md text-left transition-all">
          {hasSubscribed ? (
            <div className="flex items-center gap-2.5 text-xs text-emerald-400 font-medium">
              <span className="h-7 w-7 rounded-xl bg-emerald-500/20 grid place-items-center shrink-0">
                <BellRing size={15} className="text-emerald-400" />
              </span>
              <div>
                <p className="font-semibold text-white">Lembretes ativados com sucesso!</p>
                <p className="text-[0.72rem] text-zinc-400 mt-0.5">
                  Avisaremos você no seu celular antes do seu corte com {summary.barberName}.
                </p>
              </div>
            </div>
          ) : (
            <div>
              <div className="flex items-start gap-2.5">
                <div className="h-8 w-8 rounded-xl bg-amber-500/20 text-amber-400 grid place-items-center shrink-0">
                  <Bell size={16} />
                </div>
                <div>
                  <div className="flex items-center gap-1.5">
                    <p className="font-semibold text-xs text-white">Lembrete de Horário</p>
                    <Sparkles size={11} className="text-amber-400" />
                  </div>
                  <p className="text-xs text-zinc-300 mt-0.5 leading-snug">
                    Deseja receber um aviso no celular antes do seu horário para não esquecer?
                  </p>
                </div>
              </div>

              <div className="mt-2.5 flex justify-end">
                <button
                  type="button"
                  onClick={handleActivatePush}
                  disabled={isLoading}
                  className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-600 px-3.5 py-1.5 text-xs font-semibold text-zinc-950 shadow-md shadow-amber-500/20 hover:brightness-110 active:scale-95 transition-all select-none touch-manipulation disabled:opacity-50"
                >
                  {isLoading ? (
                    <>
                      <Loader2 size={13} className="animate-spin" />
                      <span>Ativando…</span>
                    </>
                  ) : (
                    <>
                      <BellRing size={13} />
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
