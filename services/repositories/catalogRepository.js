import { Image as ImageIcon } from "lucide-react";
import { formatPrice } from "@/core/domain/time";

export function Picture({ name, image, className = "" }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt={name} className={`absolute inset-0 w-full h-full object-cover opacity-40 ${className}`} />
  ) : (
    <div className={`absolute inset-0 grid place-items-center bg-zinc-800 text-zinc-600 ${className}`}><ImageIcon size={28} /></div>
  );
}

/** Cartões de serviço (seleção múltipla). O número no canto permite responder "1 e 3" por texto. */
export default function ServicesWidget({ ctx, act }) {
  const { services } = ctx.catalog;
  const selected = new Set(ctx.draft.services.map((s) => s.id));
  return (
    <div className="service-list grid grid-cols-2 gap-2 my-2">
      {services.map((service, index) => (
        <button
          key={service.id}
          type="button"
          aria-pressed={selected.has(service.id)}
          onClick={() => act({ type: "TOGGLE_SERVICE", id: service.id })}
          className={`relative overflow-hidden rounded-xl p-3 flex flex-col justify-between text-left border transition-all h-32 ${
            selected.has(service.id) ? "border-red-500 bg-zinc-900/90 shadow-lg shadow-red-500/10" : "border-zinc-800 bg-zinc-900/50 hover:border-zinc-700"
          }`}
        >
          <Picture name={service.name} image={service.image} />
          <div className="relative z-10 flex justify-between items-start w-full">
            <span className="grid place-items-center w-6 h-6 rounded-full bg-black/60 text-xs font-bold text-white border border-zinc-700">{index + 1}</span>
            <span className={`w-4 h-4 rounded-full border grid place-items-center ${selected.has(service.id) ? "border-red-500 bg-red-500 text-white" : "border-zinc-600 bg-transparent"}`}>
              {selected.has(service.id) && <span className="w-1.5 h-1.5 rounded-full bg-white" />}
            </span>
          </div>
          <div className="relative z-10 mt-auto">
            <b className="block text-sm font-semibold text-white drop-shadow">{service.name}</b>
            <small className="text-xs text-zinc-300 drop-shadow">{formatPrice(service.price)}{service.durationMinutes ? ` · ${service.durationMinutes} min` : ""}</small>
          </div>
        </button>
      ))}
    </div>
  );
}