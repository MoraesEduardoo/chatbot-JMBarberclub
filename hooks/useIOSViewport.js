"use client";

import { useEffect, useState } from "react";

/**
 * Hook especializado em gerenciar as peculiaridades do WebKit / Safari no iOS:
 * 1. Altura dinâmica real da viewport (compensando a barra de navegação retrátil e o teclado virtual).
 * 2. Detecção de abertura/fechamento do teclado do iPhone (diferença entre innerHeight e visualViewport.height).
 * 3. Identificação de ambiente iOS e modo PWA instalado (standalone).
 */
export function useIOSViewport() {
  const [viewportHeight, setViewportHeight] = useState("100dvh");
  const [isKeyboardOpen, setIsKeyboardOpen] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    // Detecção precisa de iOS (iPhone, iPad, iPod)
    const ua = window.navigator.userAgent.toLowerCase();
    const isAppleDevice =
      /iphone|ipad|ipod/.test(ua) ||
      (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
    setIsIOS(isAppleDevice);

    // Detecção de PWA instalado na Tela de Início
    const standaloneMode =
      window.matchMedia("(display-mode: standalone)").matches ||
      Boolean(window.navigator.standalone);
    setIsStandalone(standaloneMode);

    const updateDimensions = () => {
      const vv = window.visualViewport;
      if (vv) {
        const height = Math.round(vv.height);
        setViewportHeight(`${height}px`);
        document.documentElement.style.setProperty("--app-height", `${height}px`);

        // No iPhone, o teclado virtual mede tipicamente > 150px.
        // Se a altura visual encolheu significativamente em relação a window.innerHeight, o teclado está aberto.
        const keyboardActive = window.innerHeight - height > 140;
        setIsKeyboardOpen(keyboardActive);
      } else {
        const h = window.innerHeight;
        setViewportHeight(`${h}px`);
        document.documentElement.style.setProperty("--app-height", `${h}px`);
      }
    };

    updateDimensions();

    if (window.visualViewport) {
      window.visualViewport.addEventListener("resize", updateDimensions);
      window.visualViewport.addEventListener("scroll", updateDimensions);
    } else {
      window.addEventListener("resize", updateDimensions);
    }

    window.addEventListener("orientationchange", updateDimensions);

    return () => {
      if (window.visualViewport) {
        window.visualViewport.removeEventListener("resize", updateDimensions);
        window.visualViewport.removeEventListener("scroll", updateDimensions);
      } else {
        window.removeEventListener("resize", updateDimensions);
      }
      window.removeEventListener("orientationchange", updateDimensions);
    };
  }, []);

  return { viewportHeight, isKeyboardOpen, isIOS, isStandalone };
}
