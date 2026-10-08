"use client";

import { useEffect, useRef, useState } from "react";
import { Send } from "lucide-react";
import { S } from "@/core/conversation/states";

const PLACEHOLDERS = {
  [S.ASK_NAME]: "Digite seu nome",
  [S.ASK_PHONE]: "(00) 00000-0000",
  [S.CHOOSE_SERVICES]: "Ex.: degradê e sobrancelha",
  [S.CHOOSE_BARBER]: "Ex.: Matheus",
  [S.CHOOSE_DATE]: "Ex.: amanhã, sexta, 15/10",
  [S.CHOOSE_TIME]: "Ex.: 14:30",
  [S.CONFIRM]: "Digite \"sim\" para confirmar",
  [S.CONFIRM_CANCEL]: "Digite \"sim\" ou \"não\"",
};

/** Caixa de texto livre — adaptada para a ergonomia do teclado e safe-area do iOS */
export default function Composer({ state, onSend, isKeyboardOpen, onFocusInput }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const disabled = state === S.BOOT || state === S.WORKING;
  const needsData = state === S.ASK_NAME || state === S.ASK_PHONE;

  // No iOS Safari, focar programmaticamente só deve ocorrer quando o fluxo exige explicitamente digitação
  useEffect(() => {
    if (needsData) {
      inputRef.current?.focus();
    }
  }, [needsData, state]);

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
      className={`shrink-0 border-t border-zinc-800 bg-zinc-950 p-3 pt-2.5 transition-all duration-150 ${
        isKeyboardOpen
          ? "pb-3" // Teclado aberto: remove o espaço extra da barra de gestos que já foi absorvida pelo teclado
          : "pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]" // Teclado fechado: respeita o Home Indicator do iPhone
      }`}
    >
      <div className="flex items-center gap-2">
        <input
          ref={inputRef}
          value={value}
          disabled={disabled}
          maxLength={200}
          inputMode={state === S.ASK_PHONE ? "tel" : "text"}
          autoComplete={state === S.ASK_PHONE ? "tel" : state === S.ASK_NAME ? "name" : "off"}
          autoCapitalize={state === S.ASK_NAME ? "words" : "sentences"}
          autoCorrect="off"
          spellCheck="false"
          enterKeyHint="send"
          aria-label="Mensagem"
          onFocus={handleFocus}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          placeholder={disabled ? "Aguarde…" : PLACEHOLDERS[state] ?? "Escreva sua mensagem…"}
          /* NOTA CRÍTICA IOS: font-size DEVE ser de no mínimo 16px (text-[16px]) para impedir o auto-zoom do Safari */
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
