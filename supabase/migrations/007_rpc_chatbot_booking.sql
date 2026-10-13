-- =============================================================================
-- 007_rpc_chatbot_booking.sql
-- =============================================================================
-- Função RPC Transacional: Criação Atômica de Agendamento pelo Chatbot.
-- Inclui:
-- 1. Upsert transparente de cliente no primeiro acesso por telefone higienizado.
-- 2. Validação estrita de limites de antecedência:
--    - Mínimo de 30 minutos em relação ao horário atual.
--    - Máximo de 30 dias de antecedência no futuro.
-- 3. Soma dinâmica de durações e preços para serviços múltiplos.
-- 4. Adição de respiro técnico (buffer de 10 min) no bloqueio da agenda.
-- 5. Lock pessimista em nível de linha (FOR UPDATE) para evitar conflitos concorrentes.
-- =============================================================================

create or replace function public.chatbot_create_appointments(
    p_client_name text,
    p_client_phone text,
    p_barber_id uuid,
    p_service_ids uuid[],
    p_date date,
    p_time time,
    p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clean_phone text;
    v_client_id uuid;
    v_current_stamp timestamp;
    v_slot_stamp timestamp;
    v_total_duration integer := 0;
    v_total_price integer := 0;
    v_clean_buffer_minutes integer := 10;
    v_start_time time;
    v_end_time time;
    v_first_appointment_id uuid;
    v_created_ids uuid[] := '{}';
    v_svc record;
    v_conflict_count integer;
    v_item_duration integer;
    v_item_price integer;
    v_step_start time;
    v_step_end time;
begin
    -- 1. Higienização estrita do número de telefone (apenas dígitos)
    v_clean_phone := regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g');
    if length(v_clean_phone) < 8 then
        return jsonb_build_object(
            'success', false,
            'code', 'INVALID_PHONE',
            'message', 'Número de telefone inválido para confirmação do agendamento.'
        );
    end if;

    -- 2. Validação das Regras de Negócio de Antecedência
    v_current_stamp := now() at time zone 'America/Sao_Paulo';
    v_slot_stamp := (p_date + p_time)::timestamp;

    -- Antecedência mínima: não permitir horários com menos de 30 minutos
    if v_slot_stamp < (v_current_stamp + interval '30 minutes') then
        return jsonb_build_object(
            'success', false,
            'code', 'LEAD_TIME_TOO_SHORT',
            'message', 'Por favor, selecione um horário com antecedência mínima de 30 minutos.'
        );
    end if;

    -- Antecedência máxima: no máximo 30 dias no futuro
    if p_date > (v_current_stamp::date + interval '30 days')::date then
        return jsonb_build_object(
            'success', false,
            'code', 'DATE_OUT_OF_RANGE',
            'message', 'Agendamentos são limitados ao período máximo de 30 dias à frente.'
        );
    end if;

    -- 3. Upsert dinâmico e transparente do Cliente (Primeiro acesso sem erros)
    select id into v_client_id 
    from public.clients 
    where phone = v_clean_phone 
    limit 1;

    if v_client_id is null then
        insert into public.clients (name, phone)
        values (trim(p_client_name), v_clean_phone)
        returning id into v_client_id;
    else
        update public.clients
        set name = coalesce(nullif(trim(p_client_name), ''), name),
            updated_at = now()
        where id = v_client_id;
    end if;

    -- 4. Cálculo Dinâmico de Duração Total e Preço Total (Soma de Serviços)
    for v_svc in 
        select 
            s.id,
            coalesce(bs.custom_duration_minutes, s.duration_minutes) as duration,
            coalesce(bs.custom_price, s.price) as price
        from unnest(p_service_ids) with ordinality as u(svc_id, ord)
        join public.services s on s.id = u.svc_id
        left join public.barber_services bs on bs.service_id = s.id and bs.barber_id = p_barber_id
        order by u.ord
    loop
        v_total_duration := v_total_duration + v_svc.duration;
        v_total_price := v_total_price + v_svc.price;
    end loop;

    if v_total_duration <= 0 then
        v_total_duration := 30; -- Fallback seguro caso vazio
    end if;

    v_start_time := p_time;
    v_end_time := (p_time + (interval '1 minute' * v_total_duration))::time;

    -- 5. Lock Concorrente Pessimista e Validação de Sobreposição (com Buffer de Limpeza)
    perform 1
    from public.barbers
    where id = p_barber_id
    for update;

    select count(*) into v_conflict_count
    from public.appointments a
    where a.barber_id = p_barber_id
      and a.appointment_date = p_date
      and a.status = 'confirmed'
      and (
          -- Considera a duração agendada mais o intervalo técnico de 10 min
          (a.appointment_time < (v_end_time + (interval '1 minute' * v_clean_buffer_minutes))::time)
          and
          ((a.appointment_end_time + (interval '1 minute' * v_clean_buffer_minutes))::time > v_start_time)
      );

    if v_conflict_count > 0 then
        return jsonb_build_object(
            'success', false,
            'code', 'TIME_SLOT_UNAVAILABLE',
            'message', 'Este horário já foi preenchido ou não possui o intervalo necessário. Deseja entrar na lista de espera?'
        );
    end if;

    -- 6. Inserção dos registros na tabela appointments
    v_step_start := v_start_time;
    for v_svc in 
        select 
            s.id,
            s.name,
            coalesce(bs.custom_duration_minutes, s.duration_minutes) as duration,
            coalesce(bs.custom_price, s.price) as price
        from unnest(p_service_ids) with ordinality as u(svc_id, ord)
        join public.services s on s.id = u.svc_id
        left join public.barber_services bs on bs.service_id = s.id and bs.barber_id = p_barber_id
        order by u.ord
    loop
        v_item_duration := v_svc.duration;
        v_item_price := v_svc.price;
        v_step_end := (v_step_start + (interval '1 minute' * v_item_duration))::time;

        insert into public.appointments (
            client_id,
            barber_id,
            service_id,
            client_name,
            client_phone,
            appointment_date,
            appointment_time,
            appointment_end_time,
            duration_minutes,
            total_price,
            status,
            notes
        )
        values (
            v_client_id,
            p_barber_id,
            v_svc.id,
            trim(p_client_name),
            v_clean_phone,
            p_date,
            v_step_start,
            v_step_end,
            v_item_duration,
            v_item_price,
            'confirmed',
            p_notes
        )
        returning id into v_first_appointment_id;

        v_created_ids := array_append(v_created_ids, v_first_appointment_id);
        v_step_start := v_step_end;
    end loop;

    -- Caso não tenha passado por nenhum serviço na lista, gera um agendamento padrão
    if array_length(v_created_ids, 1) is null or array_length(v_created_ids, 1) = 0 then
        insert into public.appointments (
            client_id,
            barber_id,
            service_id,
            client_name,
            client_phone,
            appointment_date,
            appointment_time,
            appointment_end_time,
            duration_minutes,
            total_price,
            status,
            notes
        )
        values (
            v_client_id,
            p_barber_id,
            (select id from public.services where is_active = true order by display_order limit 1),
            trim(p_client_name),
            v_clean_phone,
            p_date,
            v_start_time,
            v_end_time,
            v_total_duration,
            v_total_price,
            'confirmed',
            p_notes
        )
        returning id into v_first_appointment_id;

        v_created_ids := array_append(v_created_ids, v_first_appointment_id);
    end if;

    return jsonb_build_object(
        'success', true,
        'appointment_id', v_created_ids[1],
        'appointment_ids', to_jsonb(v_created_ids),
        'client_id', v_client_id,
        'date', p_date,
        'start_time', to_char(v_start_time, 'HH24:MI'),
        'end_time', to_char(v_end_time, 'HH24:MI'),
        'duration_minutes', v_total_duration,
        'total_price', v_total_price,
        'message', 'Agendamento confirmado com sucesso!'
    );
end;
$$;

-- Concessão de permissões de execução
grant execute on function public.chatbot_create_appointments(text, text, uuid, uuid[], date, time, text) to anon, authenticated;
