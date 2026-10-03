/** Widgets estáticos (tabelas informativas) — recebem os dados prontos na própria mensagem. */
export function CatalogWidget({ services }) {
  return (
    <ul className="mt-2 divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm">
      {services.map((s) => (
        <li key={s.id} className="flex items-center justify-between gap-3 px-3 py-2">
          <span>{s.name}</span>
          <b className="shrink-0 text-white">{s.priceText}</b>
        </li>
      ))}
    </ul>
  );
}

export function HoursWidget({ rows }) {
  return (
    <ul className="mt-2 divide-y divide-zinc-800 rounded-2xl border border-zinc-800 bg-zinc-950 text-sm">
      {rows.map((r) => (
        <li key={r.label} className="flex items-center justify-between px-3 py-2">
          <span>{r.label}</span>
          <b className={r.hours === "Fechado" ? "text-zinc-500" : "text-white"}>{r.hours}</b>
        </li>
      ))}
    </ul>
  );
}
