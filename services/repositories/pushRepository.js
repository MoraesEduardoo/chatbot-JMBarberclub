import { getSupabase } from "../supabase/browser.js";
import { normalizePhone } from "../../core/domain/phone.js";

/**
 * Repositório responsável por salvar e sincronizar inscrições Push na tabela `push_subscriptions` do Supabase.
 * 
 * Estrutura comum da tabela push_subscriptions:
 * - endpoint (text, unique)
 * - p256dh (text)
 * - auth (text)
 * - subscription (jsonb)
 * - client_phone ou phone (text)
 * - client_name (text)
 * - user_agent (text)
 */
export async function savePushSubscription({ subscription, client }) {
  if (!subscription) {
    throw new Error("Objeto de PushSubscription inválido.");
  }

  const supabase = getSupabase();
  const subJson = typeof subscription.toJSON === "function" ? subscription.toJSON() : subscription;
  const endpoint = subJson.endpoint;
  const p256dh = subJson.keys?.p256dh || "";
  const auth = subJson.keys?.auth || "";
  const phone = client?.phone ? normalizePhone(client.phone) : "";
  const name = client?.name || "";

  // Se o Supabase não estiver configurado (modo demonstração), armazena localmente
  if (!supabase) {
    console.info("[push] Modo demonstração: PushSubscription gravada localmente.", { endpoint, phone, name });
    try {
      localStorage.setItem("jm_demo_push_sub", JSON.stringify({ endpoint, p256dh, auth, phone, name }));
    } catch {
      // Ignora erro em iframes sem permissão
    }
    return { ok: true, demo: true };
  }

  // Tenta salvar com o payload completo
  const fullPayload = {
    endpoint,
    p256dh,
    auth,
    subscription: subJson,
    client_phone: phone,
    phone: phone,
    client_name: name,
    user_agent: typeof navigator !== "undefined" ? navigator.userAgent : "",
    updated_at: new Date().toISOString(),
  };

  try {
    const { error } = await supabase
      .from("push_subscriptions")
      .upsert(fullPayload, { onConflict: "endpoint" });

    if (!error) {
      return { ok: true };
    }

    // Se houve erro de coluna inexistente no schema do banco, tenta payload minimalista
    console.warn("[push] Falha com payload estendido, tentando esquema compacto:", error.message);
    const minimalPayload = {
      endpoint,
      p256dh,
      auth,
      subscription: subJson,
      client_phone: phone,
    };

    const { error: minError } = await supabase
      .from("push_subscriptions")
      .upsert(minimalPayload, { onConflict: "endpoint" });

    if (minError) {
      // Tentativa 3: apenas endpoint, subscription e phone
      const fallbackPayload = {
        endpoint,
        subscription: subJson,
        phone,
      };
      const { error: fallbackError } = await supabase
        .from("push_subscriptions")
        .upsert(fallbackPayload, { onConflict: "endpoint" });

      if (fallbackError) {
        console.error("[push] Falha crítica ao gravar na tabela push_subscriptions:", fallbackError);
        throw fallbackError;
      }
    }

    return { ok: true };
  } catch (err) {
    console.error("[push] Erro ao persistir subscrição push:", err);
    throw err;
  }
}
