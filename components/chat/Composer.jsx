"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { S } from "@/core/conversation/states";

const PLACEHOLDERS = {
  [S.ASK_NAME]: "Digite seu nome",
  [S.ASK_PHONE]: "(00) 00000-0000",
};

/**
 * Caixa de texto livre inteligente:
 * - Oculta-se completamente por padrão sempre que o passo atual depender exclusivamente de botões.
 * - Renderiza-se estritamente nos passos de captura de dados textuais: ASK_NAME e ASK_PHONE.
 * - Mantém as otimizações de iOS (font-size 16px anti-zoom e gestão de safe-area com teclado).
 */
export default function Composer({ state, onSend, isKeyboardOpen, onFocusInput }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);

  // Lógica condicional: a caixa de texto livre só deve estar ativa e visível
  // estritamente quando o bot estiver solicitando o nome ou o telefone do cliente.
  const isTextInputStep = state === S.ASK_NAME || state === S.ASK_PHONE;

  // Foco automático exclusivo nos passos de preenchimento textual
  useEffect(() => {
    if (isTextInputStep) {
      inputRef.current?.focus();
    }
  }, [isTextInputStep, state]);

  // Se o passo atual depender apenas de botões/cartões, o input fica 100% oculto
  if (!isTextInputStep) {
    return null;
  }

  const disabled = state === S.BOOT || state === S.WORKING;

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  const handleFocus = () => {
    if (onFocusInput) {
      setTimeout(() => onFocusInput(), 200);
    }
  };

  return (
    <footer
      className={`shrink-0 border-t border-zinc-800 bg-zinc-950 p-3 pt-2.5 transition-all duration-150 animate-fadeIn ${
        isKeyboardOpen
          ? "pb-3" // Teclado aberto: remove folga da barra de gestos que já foi absorvida
          : "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]" // Teclado fechado: respeita o Home Indicator do iPhone
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          disabled={disabled}
          maxLength={state === S.ASK_PHONE ? 20 : 60}
          inputMode={state === S.ASK_PHONE ? "tel" : "text"}
          autoComplete={state === S.ASK_PHONE ? "tel" : "name"}
          autoCapitalize={state === S.ASK_NAME ? "words" : "sentences"}
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="send"
          aria-label="Mensagem"
          onFocus={handleFocus}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          placeholder={disabled ? "Aguarde…" : PLACEHOLDERS[state] ?? "Digite aqui…"}
          /* NOTA CRÍTICA IOS: font-size 16px (text-[16px]) obrigatório para impedir auto-zoom no Safari */
          className="flex-1 min-w-0 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-[16px] leading-normal outline-none focus:border-blue-500 text-white placeholder:text-zinc-500 disabled:opacity-60 transition-colors shadow-inner"
        />
        <button
          type="button"
          onClick={submit}
          disabled={disabled || !value.trim()}
          aria-label="Enviar"
          className="send-button shrink-0 disabled:opacity-40 active:scale-90 active:bg-blue-700 transition-transform select-none touch-manipulation"
        >
          <Send size={17} />
        </button>
      </div>
    </footer>
  );
}
