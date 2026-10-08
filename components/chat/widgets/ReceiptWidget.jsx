import { Check } from "lucide-react";

/** Comprovante estático (usa o snapshot gravado na mensagem, não o estado vivo). */
export default function ReceiptWidget({ summary }) {
  return (
    <div className="mt-3 rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-center select-text shadow-sm">
      <span className="mx-auto mb-2 h-10 w-10 rounded-full bg-emerald-500/15 text-emerald-400 grid place-items-center">
        <Check size={20} />
      </span>
      <p className="font-semibold text-white text-base">{summary.serviceNames}</p>
      <p className="text-sm text-zinc-300">com {summary.barberName}</p>
      <p className="mt-1 text-sm text-zinc-300 font-medium">{summary.dateText} às {summary.time}</p>
      <p className="mt-2 text-xs text-zinc-400 border-t border-zinc-800 pt-2 font-semibold">
        Total: <span className="text-emerald-400">{summary.totalText}</span>
      </p>
    </div>
  );
}
