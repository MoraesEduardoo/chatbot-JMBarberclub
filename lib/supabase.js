import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

// Blindagem: Validação explícita em tempo de build/execução para evitar instâncias nulas silenciosas
if (!url || !anonKey) {
  console.error("❌ ERRO CRÍTICO DE SEGURANÇA/CONFIGURAÇÃO: As variáveis de ambiente do Supabase não foram definidas.");
}

export const supabase = url && anonKey ? createClient(url, anonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  }
}) : null;

export function assertSupabase() {
  if (!supabase) {
    throw new Error("Configuração ausente: Verifique se NEXT_PUBLIC_SUPABASE_URL e NEXT_PUBLIC_SUPABASE_ANON_KEY estão presentes no arquivo .env ou .env.local.");
  }
  return supabase;
}