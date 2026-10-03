import { createBrowserClient } from "@supabase/ssr";

let client; // undefined = ainda não criado · null = sem configuração

/**
 * Cliente Supabase do navegador — criado uma única vez (singleton).
 * Devolve null quando as variáveis de ambiente não existem; nesse caso o chat
 * funciona em modo demonstração com o catálogo local (core/domain/config.js).
 */
export function getSupabase() {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    console.warn("[chat] NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ausentes — modo demonstração.");
    client = null;
  } else {
    client = createBrowserClient(url, key);
  }
  return client;
}

export const isSupabaseConfigured = () => getSupabase() !== null;
