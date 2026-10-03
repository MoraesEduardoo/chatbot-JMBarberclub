"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createInitialContext, reduce } from "@/core/conversation/machine";
import { createEffectRunner } from "@/services/effects";
import { loadClient } from "@/services/clientStorage";

/**
 * Liga a máquina de estados ao React.
 *
 * `ctxRef` guarda o contexto mais recente de forma síncrona: duas actions disparadas
 * no mesmo tick (ex.: resposta de rede + clique) nunca leem um estado "velho".
 * Os efeitos rodam FORA do reducer, uma única vez por action — por isso o
 * React.StrictMode (que executa efeitos duas vezes em dev) não duplica gravações:
 * BOOT_DONE só vale no estado BOOT.
 */
export function useChatbot() {
  const ctxRef = useRef(null);
  if (ctxRef.current === null) ctxRef.current = createInitialContext(Date.now());
  const [ctx, setCtx] = useState(ctxRef.current);

  const runnerRef = useRef(null);

  const dispatch = useCallback((action) => {
    const { ctx: next, effects } = reduce(ctxRef.current, { ...action, now: Date.now() });
    ctxRef.current = next;
    setCtx(next);
    for (const effect of effects) runnerRef.current?.(effect);
  }, []);

  runnerRef.current ??= createEffectRunner(dispatch);

  useEffect(() => {
    dispatch({ type: "BOOT_DONE", client: loadClient() });
  }, [dispatch]);

  const sendText = useCallback((text) => dispatch({ type: "TEXT", text }), [dispatch]);
  /** Executa uma action semântica (clique em botão); `bubble` aparece como fala do usuário. */
  const act = useCallback((action, bubble) => dispatch(bubble ? { ...action, bubble } : action), [dispatch]);

  return { ctx, sendText, act };
}
