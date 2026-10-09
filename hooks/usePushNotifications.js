"use client";

import { useCallback, useEffect, useState } from "react";
import { savePushSubscription } from "@/services/repositories/pushRepository";

// Chave pública VAPID (se existir no ambiente ou chave pública padrão para demonstração)
const VAPID_PUBLIC_KEY = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "";

function urlBase64ToUint8Array(base64String) {
  if (!base64String) return undefined;
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

/**
 * Hook para gerenciamento de Notificações Push no Chatbot:
 * - Detecta suporte nativo do navegador / WebKit do iPhone (iOS 16.4+ quando adicionado à Tela de Início).
 * - Monitora o estado da permissão (default, granted, denied).
 * - Solicita permissão e cadastra a inscrição Push no Service Worker.
 * - Envia a PushSubscription para gravação na tabela `push_subscriptions` do Supabase.
 */
export function usePushNotifications() {
  const [isSupported, setIsSupported] = useState(false);
  const [permission, setPermission] = useState("default");
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const supported = "Notification" in window && "serviceWorker" in navigator && "PushManager" in window;
    setIsSupported(supported);

    if (supported) {
      setPermission(Notification.permission);
      // Verifica se já existe uma inscrição ativa
      navigator.serviceWorker.ready
        .then((reg) => reg.pushManager.getSubscription())
        .then((sub) => {
          if (sub) {
            setIsSubscribed(true);
          }
        })
        .catch(() => {});
    }
  }, []);

  /**
   * Solicita permissão nativa e grava no Supabase com os dados do cliente
   */
  const subscribeToPush = useCallback(
    async (client) => {
      if (!isSupported) {
        throw new Error("Notificações Push não são suportadas neste navegador/dispositivo.");
      }

      setIsLoading(true);
      setError(null);

      try {
        // 1. Solicita a permissão nativa do navegador
        const perm = await Notification.requestPermission();
        setPermission(perm);

        if (perm !== "granted") {
          setIsLoading(false);
          return { success: false, reason: "denied" };
        }

        // 2. Aguarda a prontidão do Service Worker
        const reg = await navigator.serviceWorker.ready;

        // 3. Obtém ou cria a assinatura Push
        let subscription = await reg.pushManager.getSubscription();
        if (!subscription) {
          const subscribeOptions = {
            userVisibleOnly: true,
          };

          if (VAPID_PUBLIC_KEY) {
            subscribeOptions.applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
          }

          subscription = await reg.pushManager.subscribe(subscribeOptions);
        }

        // 4. Salva a assinatura na tabela push_subscriptions do Supabase
        await savePushSubscription({ subscription, client });

        setIsSubscribed(true);

        // 5. Feedback visual imediato: exibe notificação local de boas-vindas
        try {
          reg.showNotification("Lembretes Ativados! 💈", {
            body: `Tudo pronto, ${client?.name || "cliente"}! Avisaremos você antes do seu corte.`,
            icon: "/icons/logo-192.png",
            badge: "/icons/logo-192.png",
          });
        } catch {
          // Em alguns navegadores móveis showNotification requer evento Push
        }

        setIsLoading(false);
        return { success: true, subscription };
      } catch (err) {
        console.error("[usePushNotifications] Erro ao ativar notificações:", err);
        setError(err.message || "Erro ao ativar notificações");
        setIsLoading(false);
        return { success: false, error: err };
      }
    },
    [isSupported]
  );

  return {
    isSupported,
    permission,
    isSubscribed,
    isLoading,
    error,
    subscribeToPush,
  };
}
