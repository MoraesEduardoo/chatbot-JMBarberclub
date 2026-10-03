import { quickRepliesFor } from "@/core/conversation/quickReplies";

/** Botões de resposta rápida — derivados do estado (nunca ficam velhos). */
export default function QuickReplies({ ctx, act }) {
  const chips = quickRepliesFor(ctx);
  if (!chips.length) return null;
  return (
    <div className="shrink-0 flex gap-2 overflow-x-auto px-3 pt-2.5 pb-1 chip-row">
      {chips.map((chip) => (
        <button
          key={`${chip.label}-${chip.action.type}-${chip.action.id ?? chip.action.time ?? ""}`}
          type="button"
          onClick={() => act(chip.action, chip.bubble === undefined ? chip.label : chip.bubble)}
          className="chip"
        >
          {chip.label}
        </button>
      ))}
    </div>
  );
}
