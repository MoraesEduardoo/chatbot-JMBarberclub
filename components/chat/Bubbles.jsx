import { Scissors } from "lucide-react";

export function BotBubble({ children, wide = false }) {
  return (
    <div className="flex items-start gap-2">
      <div className="h-8 w-8 shrink-0 rounded-full bg-red-600 grid place-items-center"><Scissors size={14} /></div>
      <div className={`${wide ? "max-w-[92%]" : "max-w-[88%]"} min-w-0 rounded-2xl rounded-tl-sm border border-zinc-800 bg-zinc-900 p-3 text-sm leading-relaxed text-zinc-200`}>
        {children}
      </div>
    </div>
  );
}

export function UserBubble({ children }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[82%] break-words rounded-2xl rounded-tr-sm bg-blue-600 px-4 py-2.5 text-sm font-medium text-white">{children}</div>
    </div>
  );
}

export function TypingBubble() {
  return (
    <div className="flex items-start gap-2" role="status" aria-label="Digitando">
      <div className="h-8 w-8 shrink-0 rounded-full bg-red-600 grid place-items-center"><Scissors size={14} /></div>
      <div className="rounded-2xl rounded-tl-sm border border-zinc-800 bg-zinc-900 px-4 py-3"><span className="typing-dots"><i /><i /><i /></span></div>
    </div>
  );
}
