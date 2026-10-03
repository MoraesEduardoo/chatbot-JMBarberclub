import { Image as ImageIcon } from "lucide-react";
import { formatPrice } from "@/core/domain/time";

export function Picture({ name, image, className = "" }) {
  return image ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt={name} className={`object-cover ${className}`} />
  ) : (
    <div className={`grid place-items-center border border-zinc-700 bg-zinc-800 text-red-500 ${className}`}><ImageIcon size={24} /></div>
  );
}

/** Cartões de serviço (seleção múltipla). O número no canto permite responder "1 e 3" por texto. */
export default function ServicesWidget({ ctx, act }) {
  const { services } = ctx.catalog;
  const selected = new Set(ctx.draft.services.map((s) => s.id));
  return (
    <div className="service-list">
      {services.map((service, index) => (
        <button
          key={service.id}
          type="button"
          aria-pressed={selected.has(service.id)}
          onClick={() => act({ type: "TOGGLE_SERVICE", id: service.id })}
          className={`service-card ${selected.has(service.id) ? "selected" : ""}`}
        >
          <span className="number-badge">{index + 1}</span>
          <Picture name={service.name} image={service.image} className="service-photo" />
          <span>
            <b>{service.name}</b>
            <small>{formatPrice(service.price)}{service.durationMinutes ? ` · ${service.durationMinutes} min` : ""}</small>
          </span>
          <span className="selection-dot" />
        </button>
      ))}
    </div>
  );
}
