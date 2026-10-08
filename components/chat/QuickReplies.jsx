import { quickRepliesFor } from "@/core/conversation/quickReplies";

/** Botões de resposta rápida — derivados do estado, com toque suave e momentum no iOS */
export default function QuickReplies({ ctx, act }) {
  const chips = quickRepliesFor(ctx);
  if (!chips.length) return null;
  return (
    <div
      className="shrink-0 flex gap-2 overflow-x-auto px-3 pt-2 pb-1.5 chip-row ios-scroll-momentum select-none"
      style={{ WebkitOverflowScrolling: "touch" }}
    >
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
