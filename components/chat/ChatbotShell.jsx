"use client";

import { Calendar, Scissors } from "lucide-react";
import { SHOP } from "@/core/domain/config";
import { useChatbot } from "@/hooks/useChatbot";
import MessageList from "./MessageList";
import QuickReplies from "./QuickReplies";
import Composer from "./Composer";

/**
 * Casca visual do chat: só compõe os blocos. Nenhuma regra de negócio mora aqui —
 * ela está em core/ (máquina de estados) e services/ (Supabase).
 */
export default function ChatbotShell() {
  const { ctx, sendText, act } = useChatbot();

  return (
    <section className="w-full max-w-md h-dvh flex flex-col bg-zinc-950 text-white shadow-2xl overflow-hidden relative">
      <header className="shrink-0 flex items-center justify-between px-4 py-3.5 border-b border-zinc-800 bg-zinc-950/80 backdrop-blur">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-red-600 grid place-items-center shadow-lg shadow-red-600/30"><Scissors size={19} /></div>
          <div>
            <h1 className="font-semibold text-sm">{SHOP.name}</h1>
            <p className="text-xs text-zinc-400">Assistente Virtual · online</p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => act({ type: "VIEW_APPOINTMENTS", mode: "view" }, "Meus agendamentos")}
          title="Ver meus agendamentos"
          className="flex items-center gap-2 px-3.5 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white text-xs font-semibold shadow-lg shadow-red-600/30 hover:brightness-110 active:scale-95 transition-all border border-red-500/40"
        >
          <Calendar size={15} /><span>Meus cortes</span>
        </button>
      </header>

      <MessageList ctx={ctx} act={act} />
      <QuickReplies ctx={ctx} act={act} />
      <Composer state={ctx.state} onSend={sendText} />
    </section>
  );
}
