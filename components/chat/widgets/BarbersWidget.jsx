import { selectEligibleBarbers } from "@/core/conversation/selectors";
import { Picture } from "./ServicesWidget";

export default function BarbersWidget({ ctx, act }) {
  const eligible = new Set(selectEligibleBarbers(ctx).map((b) => b.id));
  return (
    <div className="grid grid-cols-2 gap-3">
      {ctx.catalog.barbers.map((barber) => {
        const unavailable = !eligible.has(barber.id);
        const isSelected = ctx.draft.barber?.id === barber.id;
        return (
          <button
            key={barber.id}
            type="button"
            disabled={unavailable}
            onClick={() => act({ type: "PICK_BARBER", id: barber.id }, barber.name)}
            className={`barber-card select-none touch-manipulation transition-all active:scale-[0.97] ${
              isSelected ? "selected" : ""
            }`}
          >
            <Picture name={barber.name} image={barber.image} className="barber-photo" />
            <b>{barber.name}</b>
            {unavailable && <small className="mt-1 block text-[0.65rem] text-zinc-500">Não faz esses serviços</small>}
          </button>
        );
      })}
    </div>
  );
}
