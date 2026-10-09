"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Hook customizado para captura de evento de instalação PWA (Progressive Web App):
 * - Intercepta o evento nativo `beforeinstallprompt` do Chromium / Android / Desktop.
 * - Detecta se o aplicativo já está instalado e rodando em modo standalone.
 * - Detecta dispositivos iOS (Safari no iPhone) onde a instalação é realizada via menu Compartilhar.
 */
export function usePWAInstall() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [canPrompt, setCanPrompt] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detecta se a aplicação já está rodando como PWA instalado (Standalone)
    const checkStandalone = () => {
      const isStandaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
      const isStandaloneNav = Boolean(window.navigator.standalone);
      return isStandaloneMedia || isStandaloneNav;
    };

    setIsInstalled(checkStandalone());

    // Identificação de ecossistema Apple iOS (iPhone/iPad)
    const ua = window.navigator.userAgent.toLowerCase();
    const isApple =
      /iphone|ipad|ipod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(isApple);

    // Captura o evento nativo `beforeinstallprompt`
    const handleBeforeInstallPrompt = (e) => {
      // Previne o banner padrão e salva o evento para disparo manual sob demanda
      e.preventDefault();
      setDeferredPrompt(e);
      setCanPrompt(true);
    };

    // Notificado quando o usuário conclui com sucesso a instalação
    const handleAppInstalled = () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
      setCanPrompt(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  /**
   * Dispara o prompt nativo de instalação do navegador
   */
  const triggerInstall = useCallback(async () => {
    if (deferredPrompt) {
      try {
        await deferredPrompt.prompt();
        const choice = await deferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          setIsInstalled(true);
          setDeferredPrompt(null);
          setCanPrompt(false);
          return true;
        }
      } catch (err) {
        console.warn("[pwa] Falha ao acionar prompt de instalação:", err);
      }
      return false;
    }
    return false;
  }, [deferredPrompt]);

  return {
    deferredPrompt,
    isInstalled,
    isIOS,
    canPrompt,
    triggerInstall,
  };
}
