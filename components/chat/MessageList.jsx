"use client";

import { useCallback, useEffect, useRef } from "react";
import { S } from "@/core/conversation/states";
import { BotBubble, TypingBubble, UserBubble } from "./Bubbles";
import RichText from "./RichText";
import Widget, { isWidgetLive } from "./widgets";

/** Indicador "digitando…" enquanto algo é gravado/carregado (os horários têm o próprio "consultando…"). */
const isBusy = (ctx) =>
  ctx.state === S.WORKING ||
  (ctx.state === S.LIST_APPOINTMENTS && ctx.appointments.status === "loading") ||
  (ctx.state === S.CHOOSE_SERVICES && ctx.catalog.status === "loading");

export default function MessageList({ ctx, act, isKeyboardOpen }) {
  const scrollRef = useRef(null);
  const bottomRef = useRef(null);
  const busy = isBusy(ctx);

  /**
   * Scroll confiável no iOS Safari:
   * Combina scrollTo no container com scrollIntoView no elemento âncora inferior,
   * prevenindo o corte de widgets e mensagens durante o resize do teclado virtual.
   */
  const scrollToBottom = useCallback((smooth = true) => {
    if (bottomRef.current) {
      bottomRef.current.scrollIntoView({
        behavior: smooth ? "smooth" : "auto",
        block: "end",
      });
    } else if (scrollRef.current) {
      const el = scrollRef.current;
      el.scrollTo({
        top: el.scrollHeight,
        behavior: smooth ? "smooth" : "auto",
      });
    }
  }, []);

  // Rola para o fim a cada mensagem nova, mudança de status de disponibilidade ou indicador de digitação
  useEffect(() => {
    scrollToBottom(true);
  }, [ctx.messages.length, busy, ctx.availability.status, scrollToBottom]);

  // Quando o teclado virtual do iPhone abre, o WebKit leva ~300ms na transição.
  // Disparamos um scroll imediato e outro após a transição para manter o conteúdo visível.
  useEffect(() => {
    if (isKeyboardOpen) {
      scrollToBottom(false);
      const timer = setTimeout(() => scrollToBottom(true), 320);
      return () => clearTimeout(timer);
    }
  }, [isKeyboardOpen, scrollToBottom]);

  return (
    <div
      ref={scrollRef}
      className="flex-1 min-h-0 overflow-y-auto overscroll-contain p-4 space-y-3 ios-scroll-momentum"
      style={{ WebkitOverflowScrolling: "touch" }}
      aria-live="polite"
    >
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
      {/* Âncora invisível para forçar o scroll exato até o final no iOS */}
      <div ref={bottomRef} className="h-0 w-full shrink-0" aria-hidden="true" />
    </div>
  );
}
