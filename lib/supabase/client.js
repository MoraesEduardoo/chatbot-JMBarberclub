import { createBrowserClient } from '@supabase/ssr'

export function createClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseAnonKey) {
    console.warn("⚠️ Supabase URL ou Anon Key não encontradas durante o build estático.")
    return null; // Retorna nulo em vez de crashar o build
  }

  return createBrowserClient(supabaseUrl, supabaseAnonKey)
}