import { CalendarClock, X } from "lucide-react";
import { formatDateLong } from "@/core/domain/time";

export default function AppointmentsWidget({ ctx, act }) {
  const { intent, groups } = ctx.appointments;
  return (
    <div className="space-y-2.5">
      {groups.map((g) => (
        <div key={g.key} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-xs space-y-2 select-none">
          <div className="flex items-center justify-between text-zinc-400">
            <span>{formatDateLong(g.dateKey)}</span>
            <span className="font-semibold text-red-400 text-sm">{g.time}</span>
          </div>
          <p className="font-medium text-white text-sm">{g.serviceNames.join(" + ")}</p>
          <p className="text-zinc-400">Barbeiro: {g.barberName}</p>
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
