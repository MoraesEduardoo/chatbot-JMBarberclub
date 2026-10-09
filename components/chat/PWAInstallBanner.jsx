"use client";

import { useEffect, useState } from "react";
import { Download, Scissors, X, Sparkles } from "lucide-react";

const DISMISS_STORAGE_KEY = "jm_pwa_banner_dismissed_until";
// Cooldown inteligente: reaparece após 10 minutos se o usuário fechar
const DISMISS_COOLDOWN_MS = 10 * 60 * 1000;

/**
 * Banner Persistente e Recorrente de Instalação do PWA
 * - Captura do evento nativo antes da instalação (`beforeinstallprompt`).
 * - Persistência inteligente: fechar o banner apenas adia a exibição temporariamente (10 min),
 *   garantindo que novos acessos ou sessões futuras voltem a incentivar a instalação.
 * - Integração multiplataforma: dispara o prompt nativo no Android/Chrome e abre guia no iOS Safari.
 */
export default function PWAInstallBanner({
  isInstalled,
  isIOS,
  canPrompt,
  onInstallNative,
  onOpenIOSGuide,
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [isDismissedTemporarily, setIsDismissedTemporarily] = useState(false);

  useEffect(() => {
    // Se a aplicação já estiver rodando instalada na tela inicial, nunca exibir o banner
    if (isInstalled) {
      setIsVisible(false);
      return;
    }

    const checkDismissal = () => {
      try {
        const dismissedUntil = localStorage.getItem(DISMISS_STORAGE_KEY);
        if (dismissedUntil) {
          const expiration = Number(dismissedUntil);
          if (Date.now() < expiration) {
            setIsDismissedTemporarily(true);
            setIsVisible(false);
            return;
          }
        }
      } catch {
        // Ignora erros de localStorage em contextos restritos
      }
      setIsDismissedTemporarily(false);
      setIsVisible(true);
    };

    checkDismissal();
  }, [isInstalled]);

  // Se já estiver instalado ou se não tiver suporte ao prompt/iOS, não renderiza
  if (isInstalled || !isVisible) {
    return null;
  }

  const handleInstallClick = async () => {
    if (isIOS) {
      onOpenIOSGuide?.();
    } else if (canPrompt) {
      await onInstallNative?.();
    } else {
      // Fallback amigável se o navegador não emitir beforeinstallprompt diretamente
      onOpenIOSGuide?.();
    }
  };

  const handleDismiss = () => {
    try {
      const expireTime = Date.now() + DISMISS_COOLDOWN_MS;
      localStorage.setItem(DISMISS_STORAGE_KEY, String(expireTime));
    } catch {
      // fallback
    }
    setIsDismissedTemporarily(true);
    setIsVisible(false);
  };

  return (
    <div className="relative z-10 mx-3 mt-2 mb-1 overflow-hidden rounded-2xl border border-red-500/30 bg-gradient-to-r from-zinc-900 via-zinc-900 to-zinc-950 p-3 shadow-xl shadow-red-950/20 backdrop-blur-md animate-fadeIn transition-all">
      {/* Detalhe de iluminação de fundo no estilo da marca */}
      <div className="pointer-events-none absolute -top-8 -right-8 h-24 w-24 rounded-full bg-red-600/15 blur-2xl" />

      <div className="flex items-start justify-between gap-2.5">
        <div className="flex items-start gap-2.5">
          <div className="h-9 w-9 shrink-0 rounded-xl bg-gradient-to-br from-red-600 to-rose-700 grid place-items-center shadow-md shadow-red-600/30">
            <Scissors size={17} className="text-white" />
          </div>

          <div className="pr-1">
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-xs text-white">Instale o App do JM BarberClub</span>
              <Sparkles size={11} className="text-red-400 shrink-0" />
            </div>
            <p className="mt-0.5 text-[0.72rem] leading-snug text-zinc-300">
              Agende seus cortes em 1 toque direto da tela inicial, com acesso rápido e notificações!
            </p>
          </div>
        </div>

        {/* Botão de fechar temporariamente (não permanente) */}
        <button
          type="button"
          onClick={handleDismiss}
          title="Lembrar mais tarde"
          aria-label="Fechar aviso de instalação temporariamente"
          className="h-6 w-6 shrink-0 rounded-full bg-zinc-800/80 grid place-items-center text-zinc-400 hover:text-white active:scale-90 transition-all"
        >
          <X size={13} />
        </button>
      </div>

      <div className="mt-2.5 flex items-center justify-end gap-2 pt-1 border-t border-zinc-800/60">
        <button
          type="button"
          onClick={handleDismiss}
          className="px-2.5 py-1.5 text-[0.7rem] font-medium text-zinc-400 hover:text-zinc-200 active:scale-95 transition-all"
        >
          Mais tarde
        </button>

        <button
          type="button"
          onClick={handleInstallClick}
          className="flex items-center gap-1.5 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 px-3.5 py-1.5 text-xs font-semibold text-white shadow-md shadow-red-600/30 hover:brightness-110 active:scale-95 transition-all border border-red-500/40 select-none touch-manipulation"
        >
          <Download size={13} />
          <span>Instalar Aplicativo</span>
        </button>
      </div>
    </div>
  );
}
