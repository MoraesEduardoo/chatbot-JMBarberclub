import { Check } from "lucide-react";

/** Comprovante estático (usa o snapshot gravado na mensagem, não o estado vivo). */
export default function ReceiptWidget({ summary }) {
  return (
    <div className="mt-3 rounded-2xl border border-zinc-700 bg-zinc-950 p-3 text-center">
      <span className="mx-auto mb-2 h-10 w-10 rounded-full bg-green-500/15 text-green-400 grid place-items-center"><Check /></span>
      <p className="font-semibold text-white">{summary.serviceNames}</p>
      <p className="text-sm text-zinc-300">com {summary.barberName}</p>
      <p className="mt-1 text-sm text-zinc-300">{summary.dateText} às {summary.time}</p>
      <p className="mt-1 text-xs text-zinc-500">Total: {summary.totalText}</p>
    </div>
  );
}
