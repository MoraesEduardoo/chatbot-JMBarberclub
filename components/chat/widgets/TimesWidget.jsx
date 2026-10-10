import { Clock3 } from "lucide-react";
import { selectSlots } from "@/core/conversation/selectors";

export default function TimesWidget({ ctx, act }) {
  const { status } = ctx.availability;
  if (status === "loading") return <p className="text-zinc-400 animate-pulse text-sm">Consultando disponibilidade…</p>;
  if (status === "error") {
    return (
      <button
        type="button"
        onClick={() => act({ type: "RETRY_AVAILABILITY" })}
        className="back-button px-4 select-none touch-manipulation active:scale-[0.97]"
      >
        Não consegui consultar — tentar de novo
      </button>
    );
  }
  // Horários que já passaram hoje nem aparecem; ocupados aparecem riscados ("Ocupado").
  const slots = selectSlots(ctx).filter((slot) => slot.reason !== "past");
  return (
    <>
      <p className="mb-3 flex items-center gap-1.5 text-xs text-zinc-400">
        <Clock3 size={15} /> Toque em um horário livre
      </p>
      <div className="grid grid-cols-3 gap-2.5 my-2">
        {slots.map((slot) => (
          <button
            key={slot.time}
            type="button"
            disabled={!slot.available}
            onClick={() => act({ type: "PICK_TIME", time: slot.time }, slot.time)}
            className={`time-button select-none touch-manipulation transition-all cursor-pointer shadow-sm ${
              ctx.draft.time === slot.time ? "selected ring-2 ring-red-500" : ""
            }`}
          >
            {slot.reason === "booked" ? "Ocupado" : slot.time}
          </button>
        ))}
      </div>
    </>
  );
}
