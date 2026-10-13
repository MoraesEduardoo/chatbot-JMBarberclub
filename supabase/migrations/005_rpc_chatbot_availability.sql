-- =============================================================================
-- 005_rpc_chatbot_availability.sql
-- =============================================================================
-- Função RPC: Cálculo de Horários Ocupados (com Duração Dinâmica e Buffer Técnico)
-- =============================================================================
-- Regras de Negócio Implementadas:
-- 1. Considera status ativos ('pendente', 'confirmado').
-- 2. Soma a duração real do procedimento com o Buffer Técnico de Limpeza (10 min).
-- 3. Expande todos os blocos de 30 minutos ocupados pelo procedimento, impedindo
--    sobreposições e garantindo o intervalo de descanso do profissional.
-- =============================================================================

create or replace function public.chatbot_booked_times(
  p_barber_id uuid,
  p_date date
)
returns table (
  appointment_time time
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_buffer_minutes integer;
begin
  -- Obtém o buffer técnico configurado (default: 10 minutos)
  select coalesce(nullif(value, '')::integer, 10)
    into v_buffer_minutes
    from public.business_settings
   where key = 'cleaning_buffer_minutes';

  if v_buffer_minutes is null then
    v_buffer_minutes := 10;
  end if;

  return query
  with occupied_ranges as (
    -- 1. Intervalos de agendamentos existentes (Início até Fim + Buffer)
    select
      (a.appointment_date at time zone 'America/Fortaleza')::time as start_time,
      ((a.appointment_date + (coalesce(a.duration_minutes, 30) + v_buffer_minutes) * interval '1 minute') at time zone 'America/Fortaleza')::time as end_time
    from public.appointments a
    where a.barber_id = p_barber_id
      and (a.appointment_date at time zone 'America/Fortaleza')::date = p_date
      and a.status in ('pendente', 'confirmado')

    union all

    -- 2. Horários de Almoço / Pausa configurados na escala do barbeiro
    select
      s.lunch_start as start_time,
      s.lunch_end as end_time
    from public.barber_schedules s
    where s.barber_id = p_barber_id
      and s.day_of_week = extract(dow from p_date)::integer
      and s.is_working = true
      and s.lunch_start is not null
      and s.lunch_end is not null
  ),
  slots as (
    -- Gera a grade diária em intervalos padrão de 30 minutos das 07:00 às 22:00
    select ('07:00'::time + (n * interval '30 minutes'))::time as slot_time
    from generate_series(0, 30) as n
  )
  select distinct s.slot_time as appointment_time
  from slots s
  join occupied_ranges r
    on s.slot_time >= r.start_time
   and s.slot_time < r.end_time
  order by appointment_time;
end;
$$;

-- Permissões de Execução
revoke all on function public.chatbot_booked_times(uuid, date) from public;
grant execute on function public.chatbot_booked_times(uuid, date) to anon, authenticated;
