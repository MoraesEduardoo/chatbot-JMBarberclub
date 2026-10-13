-- =============================================================================
-- 009_rpc_chatbot_waitlist.sql
-- =============================================================================
-- Persistência e busca para a Lista de Espera Inteligente (Waitlist).
-- Permite que clientes com horários esgotados registrem interesse para
-- preenchimento automático quando ocorrerem cancelamentos.
-- =============================================================================

-- 1. Inclusão de Cliente na Fila de Espera
create or replace function public.chatbot_join_waitlist(
    p_client_name text,
    p_client_phone text,
    p_barber_id uuid,
    p_service_name text,
    p_service_ids uuid[] default '{}'::uuid[],
    p_desired_date date default current_date,
    p_desired_time time default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
    v_clean_phone text;
    v_client_id uuid;
    v_waitlist_id uuid;
begin
    v_clean_phone := regexp_replace(coalesce(p_client_phone, ''), '[^0-9]', '', 'g');

    -- Upsert transparente do cliente
    select id into v_client_id 
    from public.clients 
    where phone = v_clean_phone 
    limit 1;

    if v_client_id is null then
        insert into public.clients (name, phone)
        values (trim(p_client_name), v_clean_phone)
        returning id into v_client_id;
    end if;

    -- Inserção na lista de espera
    insert into public.waitlist (
        client_id,
        client_name,
        client_phone,
        barber_id,
        service_name,
        service_ids,
        desired_date,
        desired_time,
        status,
        notes
    )
    values (
        v_client_id,
        trim(p_client_name),
        v_clean_phone,
        p_barber_id,
        p_service_name,
        p_service_ids,
        p_desired_date,
        p_desired_time,
        'waiting',
        'Registrado automaticamente pelo Chatbot'
    )
    returning id into v_waitlist_id;

    return jsonb_build_object(
        'success', true,
        'waitlist_id', v_waitlist_id,
        'message', 'Você foi adicionado à lista de espera! Avisaremos você caso o horário fique vago.'
    );
end;
$$;

-- 2. Busca de Candidatos na Fila de Espera (Quando um horário é cancelado)
create or replace function public.chatbot_find_waitlist_candidates(
    p_barber_id uuid,
    p_date date
)
returns table (
    waitlist_id uuid,
    client_name text,
    client_phone text,
    service_name text,
    desired_time text,
    created_at timestamp with time zone
)
language plpgsql
security definer
set search_path = public
as $$
begin
    return query
    select 
        w.id as waitlist_id,
        w.client_name,
        w.client_phone,
        coalesce(w.service_name, 'Serviço da Barbearia') as service_name,
        case when w.desired_time is not null then to_char(w.desired_time, 'HH24:MI') else 'Qualquer horário' end as desired_time,
        w.created_at
    from public.waitlist w
    where w.barber_id = p_barber_id
      and w.desired_date = p_date
      and w.status = 'waiting'
    order by w.created_at asc;
end;
$$;

-- Concessão de Permissões
grant execute on function public.chatbot_join_waitlist(text, text, uuid, text, uuid[], date, time) to anon, authenticated;
grant execute on function public.chatbot_find_waitlist_candidates(uuid, date) to anon, authenticated;
