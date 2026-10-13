import { CalendarClock, X, PhoneCall } from "lucide-react";
import { formatDateLong, minutesUntilAppointment } from "@/core/domain/time";
import { MIN_CANCEL_LEAD_MINUTES } from "@/core/domain/config";

export default function AppointmentsWidget({ ctx, act }) {
  const { intent, groups } = ctx.appointments;
  return (
    <div className="space-y-2.5">
      {groups.map((g) => {
        // Regra 2: Verifica se faltam menos de 2 horas (120 min) para o início do agendamento
        const minsLeft = minutesUntilAppointment(g.dateKey, g.time, ctx.now);
        const isUnder2Hours = minsLeft < MIN_CANCEL_LEAD_MINUTES;

        return (
          <div key={g.key} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-xs space-y-2 select-none">
            <div className="flex items-center justify-between text-zinc-400">
              <span>{formatDateLong(g.dateKey)}</span>
              <span className="font-semibold text-red-400 text-sm">{g.time}</span>
            </div>
            <p className="font-medium text-white text-sm">{g.serviceNames.join(" + ")}</p>
            <p className="text-zinc-400">Barbeiro: {g.barberName}</p>

            {isUnder2Hours ? (
              <div className="rounded-xl bg-amber-950/40 border border-amber-800/50 p-2 text-[0.72rem] text-amber-300 flex items-start gap-2">
                <PhoneCall size={14} className="text-amber-400 shrink-0 mt-0.5" />
                <span>
                  <b>Aviso de antecedência:</b> faltam menos de 2h para o corte. Cancelamentos e alterações devem ser solicitados por telefone.
                </span>
              </div>
            ) : null}

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
        );
      })}
    </div>
  );
}
