import { selectSummary } from "@/core/conversation/selectors";

function Row({ label, children }) {
  return <p><b className="text-zinc-400 font-medium">{label}:</b> {children}</p>;
}

/** Resumo editável via chips (ver quickReplies.js) — aqui só exibe o rascunho atual. */
export default function SummaryWidget({ ctx }) {
  const s = selectSummary(ctx);
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-3 space-y-1.5 text-sm">
      {s.previous && <Row label="Antes"><s className="text-zinc-500">{s.previous.dateText} às {s.previous.time}</s></Row>}
      <Row label="Serviços">{s.serviceNames}</Row>
      <Row label="Barbeiro">{s.barberName}</Row>
      <Row label={s.previous ? "Novo horário" : "Data"}>{s.dateText} às {s.time}</Row>
      <Row label="Total">{s.totalText}</Row>
    </div>
  );
}
