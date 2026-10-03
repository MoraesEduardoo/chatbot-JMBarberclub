"use client";

import { useEffect, useRef } from "react";
import { S } from "@/core/conversation/states";
import { BotBubble, TypingBubble, UserBubble } from "./Bubbles";
import RichText from "./RichText";
import Widget, { isWidgetLive } from "./widgets";

/** Indicador "digitando…" enquanto algo é gravado/carregado (os horários têm o próprio "consultando…"). */
const isBusy = (ctx) =>
  ctx.state === S.WORKING ||
  (ctx.state === S.LIST_APPOINTMENTS && ctx.appointments.status === "loading") ||
  (ctx.state === S.CHOOSE_SERVICES && ctx.catalog.status === "loading");

export default function MessageList({ ctx, act }) {
  const scrollRef = useRef(null);
  const busy = isBusy(ctx);

  // Rola para o fim a cada mensagem nova ou mudança de "ocupado".
  useEffect(() => {
    const el = scrollRef.current;
    el?.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [ctx.messages.length, busy, ctx.availability.status]);

  return (
    <div ref={scrollRef} className="flex-1 min-h-0 overflow-y-auto p-4 space-y-3" aria-live="polite">
      {ctx.messages.map((message) => {
        if (message.from === "user") return <UserBubble key={message.id}>{message.text}</UserBubble>;
        const live = isWidgetLive(message, ctx);
        if (!message.text && !live) return null; // mensagem só-widget que já não está ativa
        return (
          <BotBubble key={message.id} wide={live}>
            {message.text && <RichText text={message.text} />}
            {live && <Widget message={message} ctx={ctx} act={act} />}
          </BotBubble>
        );
      })}
      {busy && <TypingBubble />}
    </div>
  );
}
