import { Scissors } from "lucide-react";

export function BotBubble({ children, wide = false }) {
  return (
    <div className="flex items-start gap-2">
      <div className="h-8 w-8 shrink-0 rounded-full bg-red-600 grid place-items-center shadow-sm select-none">
        <Scissors size={14} className="text-white" />
      </div>
      <div
        className={`${
          wide ? "max-w-[94%] sm:max-w-[92%]" : "max-w-[88%]"
        } min-w-0 rounded-2xl rounded-tl-sm border border-zinc-800 bg-zinc-900 p-3 text-sm leading-relaxed text-zinc-200 select-text break-words`}
      >
        {children}
      </div>
    </div>
  );
}

export function UserBubble({ children }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[84%] break-words rounded-2xl rounded-tr-sm bg-gradient-to-r from-red-600 to-rose-600 px-4 py-2.5 text-sm font-medium text-white shadow-md shadow-red-600/20 select-text">
        {children}
      </div>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex items-start gap-2" role="status" aria-label="Digitando">
      <div className="h-8 w-8 shrink-0 rounded-full bg-red-600 grid place-items-center shadow-sm select-none">
        <Scissors size={14} className="text-white" />
      </div>
      <div className="rounded-2xl rounded-tl-sm border border-zinc-800 bg-zinc-900 px-4 py-3 select-none">
        <span className="typing-dots">
          <i />
          <i />
          <i />
        </span>
      </div>
    </div>
  );
}
