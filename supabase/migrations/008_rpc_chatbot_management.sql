-- =============================================================================
-- 008_rpc_chatbot_management.sql
-- =============================================================================
-- Funções RPC Transacionais de Gestão pelo Cliente:
-- 1. chatbot_list_appointments: listagem de horários por telefone.
-- 2. chatbot_cancel_appointments: cancelamento 100% livre e autônomo sem restrições.
-- 3. chatbot_reschedule_appointments: reagendamento direto de data e horário.
-- =============================================================================

-- 1. Listagem de Agendamentos por Telefone
create or replace function public.chatbot_list_appointments(
    p_phone text
)
returns table (
    appointment_id uuid,
    client_name text,
    barber_id uuid,
    barber_name text,
    service_id uuid,
    service_name text,
    appointment_date date,
    appointment_time text,
    appointment_end_time text,
    duration_minutes integer,
    total_price integer,
    status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clean_phone text;
begin
    v_clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

    return query
    select 
        a.id as appointment_id,
        a.client_name,
        a.barber_id,
        coalesce(b.name, 'Barbeiro') as barber_name,
        a.service_id,
        coalesce(s.name, 'Serviço') as service_name,
        a.appointment_date,
        to_char(a.appointment_time, 'HH24:MI') as appointment_time,
        to_char(a.appointment_end_time, 'HH24:MI') as appointment_end_time,
        a.duration_minutes,
        a.total_price,
        a.status
    from public.appointments a
    left join public.barbers b on b.id = a.barber_id
    left join public.services s on s.id = a.service_id
    where a.client_phone = v_clean_phone
      and a.status = 'confirmed'
      and a.appointment_date >= current_date
    order by a.appointment_date asc, a.appointment_time asc;
end;
$$;

-- 2. Cancelamento Totalmente Livre e Autônomo (Sem punições, multas ou restrições)
create or replace function public.chatbot_cancel_appointments(
    p_phone text,
    p_appointment_id uuid default null,
    p_reason text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clean_phone text;
    v_canceled_count integer := 0;
begin
    v_clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

    if p_appointment_id is not null then
        update public.appointments
        set status = 'canceled',
            notes = concat_ws(' | ', notes, 'Cancelado pelo cliente via Chat: ' || coalesce(p_reason, 'Livre escolha')),
            updated_at = now()
        where id = p_appointment_id
          and client_phone = v_clean_phone
          and status = 'confirmed';
          
        get diagnostics v_canceled_count = row_count;
    else
        -- Cancela os agendamentos futuros do cliente
        update public.appointments
        set status = 'canceled',
            notes = concat_ws(' | ', notes, 'Cancelamento geral via Chat: ' || coalesce(p_reason, 'Livre escolha')),
            updated_at = now()
        where client_phone = v_clean_phone
          and appointment_date >= current_date
          and status = 'confirmed';
          
        get diagnostics v_canceled_count = row_count;
    end if;

    if v_canceled_count > 0 then
        return jsonb_build_object(
            'success', true,
            'canceled_count', v_canceled_count,
            'message', 'Agendamento cancelado com sucesso. Você pode marcar um novo horário a qualquer momento!'
        );
    else
        return jsonb_build_object(
            'success', false,
            'canceled_count', 0,
            'message', 'Nenhum agendamento ativo encontrado para este telefone.'
        );
    end if;
end;
$$;

-- 3. Reagendamento Direto de Data e Horário
create or replace function public.chatbot_reschedule_appointments(
    p_phone text,
    p_appointment_id uuid,
    p_new_date date,
    p_new_time time
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clean_phone text;
    v_apt record;
    v_new_end time;
    v_clean_buffer_minutes integer := 10;
    v_conflict_count integer;
    v_current_stamp timestamp;
    v_slot_stamp timestamp;
begin
    v_clean_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9]', '', 'g');

    select * into v_apt
    from public.appointments
    where id = p_appointment_id
      and client_phone = v_clean_phone
      and status = 'confirmed'
    for update;

    if v_apt.id is null then
        return jsonb_build_object(
            'success', false,
            'code', 'APPOINTMENT_NOT_FOUND',
            'message', 'Agendamento não encontrado ou já cancelado.'
        );
    end if;

    -- Validação de Antecedência
    v_current_stamp := now() at time zone 'America/Sao_Paulo';
    v_slot_stamp := (p_new_date + p_new_time)::timestamp;

    if v_slot_stamp < (v_current_stamp + interval '30 minutes') then
        return jsonb_build_object(
            'success', false,
            'code', 'LEAD_TIME_TOO_SHORT',
            'message', 'Por favor, selecione um horário com antecedência mínima de 30 minutos.'
        );
    end if;

    if p_new_date > (v_current_stamp::date + interval '30 days')::date then
        return jsonb_build_object(
            'success', false,
            'code', 'DATE_OUT_OF_RANGE',
            'message', 'Apenas datas nos próximos 30 dias são permitidas.'
        );
    end if;

    v_new_end := (p_new_time + (interval '1 minute' * v_apt.duration_minutes))::time;

    -- Checagem de Conflitos
    select count(*) into v_conflict_count
    from public.appointments a
    where a.barber_id = v_apt.barber_id
      and a.appointment_date = p_new_date
      and a.status = 'confirmed'
      and a.id <> p_appointment_id
      and (
          (a.appointment_time < (v_new_end + (interval '1 minute' * v_clean_buffer_minutes))::time)
          and
          ((a.appointment_end_time + (interval '1 minute' * v_clean_buffer_minutes))::time > p_new_time)
      );

    if v_conflict_count > 0 then
        return jsonb_build_object(
            'success', false,
            'code', 'SLOT_OCCUPIED',
            'message', 'O novo horário escolhido não está disponível. Por favor, escolha outro slot.'
        );
    end if;

    -- Atualiza para a nova data e horário
    update public.appointments
    set appointment_date = p_new_date,
        appointment_time = p_new_time,
        appointment_end_time = v_new_end,
        updated_at = now()
    where id = p_appointment_id;

    return jsonb_build_object(
        'success', true,
        'appointment_id', p_appointment_id,
        'date', p_new_date,
        'time', to_char(p_new_time, 'HH24:MI'),
        'message', 'Agendamento reagendado com sucesso!'
    );
end;
$$;

-- Permissões de Execução
grant execute on function public.chatbot_list_appointments(text) to anon, authenticated;
grant execute on function public.chatbot_cancel_appointments(text, uuid, text) to anon, authenticated;
grant execute on function public.chatbot_reschedule_appointments(text, uuid, date, time) to anon, authenticated;
