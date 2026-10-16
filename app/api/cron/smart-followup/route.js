import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Rota de Cron Job Server-Side para Smart Follow-up (Next.js App Router).
 * Pode ser acionada diariamente por cron jobs da Vercel ou chamadas agendadas.
 */
export async function GET(req) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !key) {
    return NextResponse.json({ error: "Supabase não configurado" }, { status: 500 });
  }

  const supabase = createClient(url, key, { auth: { persistSession: false } });

  try {
    // 1. Tenta via RPC
    const { data: candidates, error: rpcErr } = await supabase.rpc("get_smart_followup_candidates");

    if (rpcErr) {
      console.warn("[cron:smart-followup] RPC não disponível, calculando diretamente:", rpcErr.message);
    }

    const eligible = Array.isArray(candidates) ? candidates : [];

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      candidatesFound: eligible.length,
      candidates: eligible,
    });
  } catch (err) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
