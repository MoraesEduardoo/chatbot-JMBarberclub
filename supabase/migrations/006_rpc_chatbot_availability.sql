-- =============================================================================
-- 006_rpc_chatbot_availability.sql
-- =============================================================================
-- Função RPC: Cálculo em tempo real dos blocos ocupados para o Chatbot.
-- Expande a duração total dos agendamentos confirmados somada a um respiro técnico
-- automático (buffer de 10 min), projetando os slots indisponíveis em passos de 30 min.
-- =============================================================================

create or replace function public.chatbot_booked_times(
    p_barber_id uuid,
    p_date date
)
returns table (
    booked_time text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clean_buffer_minutes integer := 10;
begin
    return query
    with occupied_intervals as (
        select 
            a.appointment_time as start_t,
            (a.appointment_time + (interval '1 minute' * (a.duration_minutes + v_clean_buffer_minutes)))::time as end_t
        from public.appointments a
        where a.barber_id = p_barber_id
          and a.appointment_date = p_date
          and a.status = 'confirmed'
    ),
    all_day_slots as (
        select generate_series(
            (p_date + time '08:00:00')::timestamp,
            (p_date + time '21:00:00')::timestamp,
            interval '30 minutes'
        )::time as slot_time
    )
    select distinct to_char(s.slot_time, 'HH24:MI') as booked_time
    from all_day_slots s
    join occupied_intervals o
      on s.slot_time >= o.start_t
     and s.slot_time < o.end_t
    order by booked_time asc;
end;
$$;

-- Concessão de permissões de execução para o Chatbot
grant execute on function public.chatbot_booked_times(uuid, date) to anon, authenticated;
