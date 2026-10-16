-- ============================================================================
-- MIGRATION 011: RECONHECIMENTO DE CLIENTE FIEL E SMART FOLLOW-UP
-- Barbearia JM Barberclub
-- ============================================================================

-- 1. TABELA DE LOGS DE FOLLOW-UP (Evita spam e guarda histórico de lembretes)
CREATE TABLE IF NOT EXISTS public.followup_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_phone text NOT NULL,
  client_name text,
  days_since_last_cut numeric,
  avg_interval_days numeric,
  days_overdue numeric,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'sent', -- 'sent', 'failed', 'simulated'
  channel text NOT NULL DEFAULT 'whatsapp',
  dispatched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_followup_logs_phone_dispatched 
ON public.followup_logs (client_phone, dispatched_at DESC);

-- RLS para followup_logs
ALTER TABLE public.followup_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access on followup_logs"
ON public.followup_logs
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- ----------------------------------------------------------------------------
-- 2. RPC: chatbot_get_loyalty_profile(p_phone)
-- Identifica clientes com 5+ agendamentos concluídos no mesmo serviço e profissional.
-- Executa com SECURITY DEFINER para consulta segura a partir do chatbot.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.chatbot_get_loyalty_profile(p_phone text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_clean_phone text;
  v_result json;
BEGIN
  -- Normaliza o telefone mantendo apenas números
  v_clean_phone := regexp_replace(p_phone, '\D', '', 'g');
  
  -- Remove prefixo DDI 55 se presente
  IF length(v_clean_phone) >= 12 AND substring(v_clean_phone from 1 for 2) = '55' THEN
    v_clean_phone := substring(v_clean_phone from 3);
  END IF;

  IF length(v_clean_phone) < 8 THEN
    RETURN json_build_object('is_loyal', false);
  END IF;

  -- Consulta agregada de serviços concluídos por barbeiro
  SELECT json_build_object(
    'is_loyal', true,
    'client_name', a.client_name,
    'client_phone', a.client_phone,
    'service_id', a.service_id,
    'service_name', s.name,
    'service_price', s.price,
    'service_duration', COALESCE(s.duration_minutes, 30),
    'barber_id', a.barber_id,
    'barber_name', b.name,
    'barber_avatar', COALESCE(b.avatar_url, b.image, ''),
    'total_completed', COUNT(*),
    'last_appointment_date', MAX(a.appointment_date)
  )
  INTO v_result
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  JOIN public.barbers b ON b.id = a.barber_id
  WHERE regexp_replace(a.client_phone, '\D', '', 'g') LIKE '%' || v_clean_phone || '%'
    AND a.status IN ('completed', 'concluido')
  GROUP BY a.client_name, a.client_phone, a.service_id, s.name, s.price, s.duration_minutes, a.barber_id, b.name, b.avatar_url, b.image
  HAVING COUNT(*) >= 5
  ORDER BY COUNT(*) DESC, MAX(a.appointment_date) DESC
  LIMIT 1;

  IF v_result IS NULL THEN
    RETURN json_build_object('is_loyal', false);
  END IF;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.chatbot_get_loyalty_profile(text) TO anon, authenticated, service_role;

-- ----------------------------------------------------------------------------
-- 3. FUNCTION: get_smart_followup_candidates()
-- Calcula o intervalo médio de frequência de cada cliente e identifica quem está
-- em atraso (3+ dias além da sua média histórica) sem agendamento futuro.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_smart_followup_candidates()
RETURNS TABLE (
  client_phone text,
  client_name text,
  total_cuts bigint,
  last_appointment_date date,
  avg_interval_days numeric,
  days_since_last_cut integer,
  days_overdue numeric,
  favorite_service_name text,
  favorite_barber_name text
)
LANGUAGE sql
SECURITY DEFINER
AS $$
WITH client_completed_cuts AS (
  SELECT 
    a.client_phone,
    MAX(a.client_name) as client_name,
    COUNT(*) as total_cuts,
    MIN(a.appointment_date::date) as first_date,
    MAX(a.appointment_date::date) as last_date,
    -- Intervalo médio em dias entre cortes: (Data_Último - Data_Primeiro) / (Total - 1)
    ROUND(
      (MAX(a.appointment_date::date) - MIN(a.appointment_date::date))::numeric / 
      NULLIF(COUNT(*) - 1, 0),
      1
    ) as avg_interval_days
  FROM public.appointments a
  WHERE a.status IN ('completed', 'concluido')
  GROUP BY a.client_phone
  HAVING COUNT(*) >= 2
     AND (MAX(a.appointment_date::date) - MIN(a.appointment_date::date)) > 0
),
future_active_appointments AS (
  -- Clientes que JÁ têm corte marcado no futuro ou hoje
  SELECT DISTINCT a.client_phone
  FROM public.appointments a
  WHERE a.status IN ('confirmed', 'confirmado', 'pending', 'pendente')
    AND a.appointment_date::date >= CURRENT_DATE
),
recent_followups AS (
  -- Clientes que já receberam lembrete nos últimos 7 dias (anti-spam)
  SELECT DISTINCT fl.client_phone
  FROM public.followup_logs fl
  WHERE fl.dispatched_at >= (now() - interval '7 days')
),
favorite_preferences AS (
  -- Preferência de serviço e barbeiro mais frequente
  SELECT DISTINCT ON (a.client_phone)
    a.client_phone,
    s.name as service_name,
    b.name as barber_name
  FROM public.appointments a
  JOIN public.services s ON s.id = a.service_id
  JOIN public.barbers b ON b.id = a.barber_id
  WHERE a.status IN ('completed', 'concluido')
  GROUP BY a.client_phone, s.name, b.name
  ORDER BY a.client_phone, COUNT(*) DESC
)
SELECT 
  c.client_phone,
  c.client_name,
  c.total_cuts,
  c.last_date as last_appointment_date,
  c.avg_interval_days,
  (CURRENT_DATE - c.last_date)::integer as days_since_last_cut,
  ROUND((CURRENT_DATE - c.last_date) - c.avg_interval_days, 1) as days_overdue,
  COALESCE(fp.service_name, 'Corte') as favorite_service_name,
  COALESCE(fp.barber_name, 'seu barbeiro') as favorite_barber_name
FROM client_completed_cuts c
LEFT JOIN future_active_appointments fa ON fa.client_phone = c.client_phone
LEFT JOIN recent_followups rf ON rf.client_phone = c.client_phone
LEFT JOIN favorite_preferences fp ON fp.client_phone = c.client_phone
WHERE fa.client_phone IS NULL -- Sem agendamento futuro
  AND rf.client_phone IS NULL -- Sem lembrete recente
  AND (CURRENT_DATE - c.last_date) >= (c.avg_interval_days + 3) -- 3 dias além da média
ORDER BY days_overdue DESC;
$$;

GRANT EXECUTE ON FUNCTION public.get_smart_followup_candidates() TO service_role;
