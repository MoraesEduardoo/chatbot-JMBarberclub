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

/** Caixa de texto livre — sempre disponível (exceto ao gravar): o usuário nunca fica preso a botões. */
export default function Composer({ state, onSend }) {
  const [value, setValue] = useState("");
  const inputRef = useRef(null);
  const disabled = state === S.BOOT || state === S.WORKING;
  const needsData = state === S.ASK_NAME || state === S.ASK_PHONE;

  // Só abre o teclado automaticamente quando o bot espera um dado digitado.
  useEffect(() => { if (needsData) inputRef.current?.focus(); }, [needsData, state]);

  const submit = () => {
    const text = value.trim();
    if (!text || disabled) return;
    onSend(text);
    setValue("");
  };

  return (
    <footer className="shrink-0 border-t border-zinc-800 bg-zinc-950 p-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          value={value}
          disabled={disabled}
          maxLength={200}
          inputMode={state === S.ASK_PHONE ? "tel" : "text"}
          autoComplete={state === S.ASK_PHONE ? "tel" : state === S.ASK_NAME ? "name" : "off"}
          enterKeyHint="send"
          aria-label="Mensagem"
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.nativeEvent.isComposing && submit()}
          placeholder={disabled ? "Aguarde…" : PLACEHOLDERS[state] ?? "Escreva sua mensagem…"}
          className="flex-1 min-w-0 rounded-2xl border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm outline-none focus:border-blue-500 text-white disabled:opacity-60"
        />
        <button type="button" onClick={submit} disabled={disabled || !value.trim()} aria-label="Enviar" className="send-button disabled:opacity-40">
          <Send size={17} />
        </button>
      </div>
    </footer>
  );
}
