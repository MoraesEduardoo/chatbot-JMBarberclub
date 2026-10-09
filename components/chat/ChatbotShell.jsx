"use client";

import { useState } from "react";
import { Calendar, Download, Scissors, Share, X } from "lucide-react";
import { SHOP } from "@/core/domain/config";
import { useChatbot } from "@/hooks/useChatbot";
import { useIOSViewport } from "@/hooks/useIOSViewport";
import { usePWAInstall } from "@/hooks/usePWAInstall";
import MessageList from "./MessageList";
import QuickReplies from "./QuickReplies";
import Composer from "./Composer";
import PWAInstallBanner from "./PWAInstallBanner";

/**
 * Casca visual do chat:
 * 1. Altura dinâmica vinculada ao visualViewport do iOS (elimina cortes provocados pelo teclado e barra de endereço).
 * 2. Gestão meticulosa de Safe Areas (Notch, Dynamic Island e Home Indicator).
 * 3. Banner de instalação PWA persistente e recorrente integrado ao topo do chat.
 * 4. Disparo nativo do evento `beforeinstallprompt` e modal explicativo passo a passo para iPhone (iOS).
 */
export default function ChatbotShell() {
  const { ctx, sendText, act } = useChatbot();
  const { viewportHeight, isKeyboardOpen } = useIOSViewport();
  const { isInstalled, isIOS, canPrompt, triggerInstall } = usePWAInstall();
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const handleHeaderInstallClick = async () => {
    if (canPrompt) {
      await triggerInstall();
    } else {
      setShowInstallGuide(true);
    }
  };

  return (
    <section
      style={{ height: viewportHeight }}
      className="w-full max-w-md flex flex-col bg-zinc-950 text-white shadow-2xl overflow-hidden relative"
    >
      {/* Cabeçalho com proteção estrita para Notch / Dynamic Island */}
      <header
        className="shrink-0 flex items-center justify-between px-4 pb-3 border-b border-zinc-800 bg-zinc-950/90 backdrop-blur z-20"
        style={{ paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))" }}
      >
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-2xl bg-red-600 grid place-items-center shadow-lg shadow-red-600/30 shrink-0">
            <Scissors size={19} className="text-white" />
          </div>
          <div>
            <h1 className="font-semibold text-sm leading-tight text-white">{SHOP.name}</h1>
            <p className="text-xs text-zinc-400 leading-tight mt-0.5">Assistente Virtual · online</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Botão de instalação persistente no topo (sempre visível enquanto não estiver instalado) */}
          {!isInstalled && (
            <button
              type="button"
              onClick={handleHeaderInstallClick}
              title="Instalar aplicativo"
              aria-label="Instalar aplicativo na tela de início"
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-zinc-900 border border-zinc-700/80 text-zinc-300 hover:text-white text-xs font-medium active:scale-95 transition-all shadow-sm"
            >
              <Download size={13} className="text-red-400" />
              <span>Instalar</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => act({ type: "VIEW_APPOINTMENTS", mode: "view" }, "Meus agendamentos")}
            title="Ver meus agendamentos"
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 text-white text-xs font-semibold shadow-lg shadow-red-600/30 hover:brightness-110 active:scale-95 transition-all border border-red-500/40 select-none touch-manipulation"
          >
            <Calendar size={14} />
            <span>Meus cortes</span>
          </button>
        </div>
      </header>

      {/* Banner Persistente e Recorrente de Instalação do App PWA */}
      <PWAInstallBanner
        isInstalled={isInstalled}
        isIOS={isIOS}
        canPrompt={canPrompt}
        onInstallNative={triggerInstall}
        onOpenIOSGuide={() => setShowInstallGuide(true)}
      />

      {/* Lista de mensagens com scroll dinâmico ao abrir teclado */}
      <MessageList ctx={ctx} act={act} isKeyboardOpen={isKeyboardOpen} />

      {/* Chips de resposta rápida */}
      <QuickReplies ctx={ctx} act={act} />

      {/* Input de mensagem adaptado ao teclado e safe-area */}
      <Composer
        state={ctx.state}
        onSend={sendText}
        isKeyboardOpen={isKeyboardOpen}
        onFocusInput={() => {
          // Garante alinhamento ao focar
        }}
      />

      {/* Modal Guia de Instalação Passo a Passo (iOS / Fallback) */}
      {showInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4 animate-fadeIn">
          <div className="w-full max-w-sm rounded-3xl border border-zinc-800 bg-zinc-900 p-5 shadow-2xl text-left relative">
            <button
              type="button"
              onClick={() => setShowInstallGuide(false)}
              aria-label="Fechar"
              className="absolute top-4 right-4 h-8 w-8 rounded-full bg-zinc-800 grid place-items-center text-zinc-400 hover:text-white active:scale-90"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 mb-3">
              <div className="h-10 w-10 rounded-2xl bg-red-600 grid place-items-center shadow-md shadow-red-600/30">
                <Scissors size={20} className="text-white" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-base">
                  {isIOS ? "Instalar no iPhone / iPad" : "Adicionar à Tela Inicial"}
                </h3>
                <p className="text-xs text-zinc-400">Tenha o app direto na Tela de Início</p>
              </div>
            </div>

            {isIOS ? (
              <ol className="space-y-3 text-xs text-zinc-300 my-4 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800/80">
                <li className="flex items-center gap-2.5">
                  <span className="h-5 w-5 rounded-full bg-red-500/20 text-red-400 grid place-items-center font-bold text-[11px] shrink-0">
                    1
                  </span>
                  <span>
                    Toque no botão <Share size={13} className="inline mx-1 text-blue-400" /> <b>Compartilhar</b> na barra do Safari.
                  </span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-5 w-5 rounded-full bg-red-500/20 text-red-400 grid place-items-center font-bold text-[11px] shrink-0">
                    2
                  </span>
                  <span>Role a lista para baixo e toque em <b>Adicionar à Tela de Início</b>.</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-5 w-5 rounded-full bg-red-500/20 text-red-400 grid place-items-center font-bold text-[11px] shrink-0">
                    3
                  </span>
                  <span>Confirme tocando em <b>Adicionar</b> no canto superior direito.</span>
                </li>
              </ol>
            ) : (
              <ol className="space-y-3 text-xs text-zinc-300 my-4 bg-zinc-950/60 p-4 rounded-2xl border border-zinc-800/80">
                <li className="flex items-center gap-2.5">
                  <span className="h-5 w-5 rounded-full bg-red-500/20 text-red-400 grid place-items-center font-bold text-[11px] shrink-0">
                    1
                  </span>
                  <span>Abra o menu de opções do navegador (três pontinhos no canto superior).</span>
                </li>
                <li className="flex items-center gap-2.5">
                  <span className="h-5 w-5 rounded-full bg-red-500/20 text-red-400 grid place-items-center font-bold text-[11px] shrink-0">
                    2
                  </span>
                  <span>Selecione <b>Instalar aplicativo</b> ou <b>Adicionar à tela inicial</b>.</span>
                </li>
              </ol>
            )}

            <button
              type="button"
              onClick={() => setShowInstallGuide(false)}
              className="w-full py-3 rounded-xl bg-red-600 text-white font-medium text-xs hover:bg-red-500 active:scale-95 transition-all"
            >
              Entendi
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
