import { CalendarClock, X } from "lucide-react";
import { formatDateLong } from "@/core/domain/time";

export default function AppointmentsWidget({ ctx, act }) {
  const { intent, groups } = ctx.appointments;
  return (
    <div className="space-y-2.5">
      {groups.map((g) => (
        <div key={g.key} className="rounded-2xl border border-zinc-800 bg-zinc-950 p-3 text-xs space-y-2">
          <div className="flex items-center justify-between text-zinc-400">
            <span>{formatDateLong(g.dateKey)}</span>
            <span className="font-semibold text-red-400 text-sm">{g.time}</span>
          </div>
          <p className="font-medium text-white text-sm">{g.serviceNames.join(" + ")}</p>
          <p className="text-zinc-400">Barbeiro: {g.barberName}</p>
          <div className="grid grid-cols-2 gap-2 pt-1">
            <button
              type="button"
              onClick={() => act({ type: "PICK_APPOINTMENT", key: g.key, op: "reschedule" }, "Remarcar")}
              className={`mini-button ${intent === "reschedule" ? "primary" : ""}`}
            >
              <CalendarClock size={14} /> Remarcar
            </button>
            <button
              type="button"
              onClick={() => act({ type: "PICK_APPOINTMENT", key: g.key, op: "cancel" }, "Cancelar")}
              className={`mini-button danger ${intent === "cancel" ? "primary" : ""}`}
            >
              <X size={14} /> Cancelar
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
