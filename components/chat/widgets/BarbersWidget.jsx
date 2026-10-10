import { selectEligibleBarbers } from "@/core/conversation/selectors";
import { Picture } from "./ServicesWidget";

export default function BarbersWidget({ ctx, act }) {
  const eligible = new Set(selectEligibleBarbers(ctx).map((b) => b.id));
  return (
    <div className="grid grid-cols-2 gap-3.5 my-2">
      {ctx.catalog.barbers.map((barber) => {
        const unavailable = !eligible.has(barber.id);
        const isSelected = ctx.draft.barber?.id === barber.id;
        return (
          <button
            key={barber.id}
            type="button"
            disabled={unavailable}
            onClick={() => act({ type: "PICK_BARBER", id: barber.id }, barber.name)}
            className={`barber-card select-none touch-manipulation transition-all active:scale-[0.97] cursor-pointer shadow-md ${
              isSelected ? "selected ring-2 ring-red-500 border-red-500" : ""
            }`}
          >
            <Picture name={barber.name} image={barber.image} className="barber-photo shadow-inner" />
            <b className="truncate block">{barber.name}</b>
            {unavailable && <small className="mt-1 block text-[0.7rem] text-zinc-500 font-medium">Não faz esses serviços</small>}
          </button>
        );
      })}
    </div>
  );
}
