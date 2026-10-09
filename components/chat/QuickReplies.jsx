import { quickRepliesFor } from "@/core/conversation/quickReplies";

/**
 * Botões de resposta rápida — derivados do estado atual da conversa.
 * 
 * Comportamento dinâmico:
 * - Quando o input de texto está oculto (passos de opções estruturadas),
 *   o QuickReplies assume a barra inferior com proteção de Safe Area do iOS (Home Indicator).
 * - Quando o input de texto está visível (ASK_NAME ou ASK_PHONE),
 *   o QuickReplies fica como barra de atalhos rápidos logo acima do input.
 */
export default function QuickReplies({ ctx, act, isInputHidden = false }) {
  const chips = quickRepliesFor(ctx);

  if (!chips.length) {
    // Se o input de texto estiver oculto e não houver chips, mantém a margem de segurança na base
    if (isInputHidden) {
      return <div className="h-[max(0.75rem,env(safe-area-inset-bottom,0px))] shrink-0" />;
    }
    return null;
  }

  return (
    <div
      className={`shrink-0 flex gap-2.5 overflow-x-auto px-3.5 chip-row ios-scroll-momentum select-none transition-all ${
        isInputHidden
          ? "pt-3 pb-[max(0.85rem,env(safe-area-inset-bottom,0px))] border-t border-zinc-800/80 bg-zinc-950/95 backdrop-blur-md shadow-lg"
          : "pt-2 pb-2"
      }`}
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
