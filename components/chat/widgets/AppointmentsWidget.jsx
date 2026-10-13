"use client";

import { CalendarClock, X } from "lucide-react";
import { formatDateLong } from "@/core/domain/time";

/**
 * AppointmentsWidget:
 * Lista os agendamentos ativos do cliente com opções imediatas e livres de ação.
 * 
 * Regra 2: Cancelamento e Reagendamento Livres e Autônomos:
 * - O cliente pode cancelar ou remarcar diretamente pelo chat a qualquer momento,
 *   sem restrições de prazo rígido, penalidades ou necessidade de ligar para a barbearia.
 */
export default function AppointmentsWidget({ ctx, act }) {
  const { intent, groups } = ctx.appointments;

  return (
    <div className="space-y-2.5">
      {groups.map((g) => (
        <div key={g.key} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3.5 text-xs space-y-2.5 select-none shadow-md">
          <div className="flex items-center justify-between text-zinc-400">
            <span className="font-medium text-zinc-300">{formatDateLong(g.dateKey)}</span>
            <span className="font-bold text-red-400 text-sm">{g.time}</span>
          </div>

          <p className="font-semibold text-white text-sm">{g.serviceNames.join(" + ")}</p>
          <p className="text-zinc-400">Profissional: <span className="text-zinc-200">{g.barberName}</span></p>

          <div className="grid grid-cols-2 gap-2.5 pt-1.5">
            <button
              type="button"
              onClick={() => act({ type: "PICK_APPOINTMENT", key: g.key, op: "reschedule" }, "Remarcar")}
              className={`mini-button select-none touch-manipulation active:scale-[0.96] cursor-pointer shadow-sm ${
                intent === "reschedule" ? "primary shadow-red-500/25" : ""
              }`}
            >
              <CalendarClock size={16} /> Remarcar
            </button>
            <button
              type="button"
              onClick={() => act({ type: "PICK_APPOINTMENT", key: g.key, op: "cancel" }, "Cancelar")}
              className={`mini-button danger select-none touch-manipulation active:scale-[0.96] cursor-pointer shadow-sm ${
                intent === "cancel" ? "primary shadow-red-500/25" : ""
              }`}
            >
              <X size={16} /> Cancelar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
