import { selectSummary } from "@/core/conversation/selectors";

function Row({ label, children }) {
  return (
    <p className="flex justify-between items-center text-xs sm:text-sm">
      <b className="text-zinc-400 font-medium">{label}:</b>
      <span className="text-right text-zinc-100">{children}</span>
    </p>
  );
}

/** Resumo editável via chips — adaptado para leitura limpa e cópia de dados no iOS */
export default function SummaryWidget({ ctx }) {
  const s = selectSummary(ctx);
  return (
    <div className="rounded-2xl border border-zinc-700 bg-zinc-950 p-3 space-y-2 text-sm select-text">
      {s.previous && (
        <Row label="Antes">
          <s className="text-zinc-500">{s.previous.dateText} às {s.previous.time}</s>
        </Row>
      )}
      <Row label="Serviços">{s.serviceNames}</Row>
      <Row label="Barbeiro">{s.barberName}</Row>
      <Row label={s.previous ? "Novo horário" : "Data"}>{s.dateText} às {s.time}</Row>
      <div className="border-t border-zinc-800 pt-1.5">
        <Row label="Total"><span className="font-semibold text-emerald-400">{s.totalText}</span></Row>
      </div>
    </div>
  );
}
