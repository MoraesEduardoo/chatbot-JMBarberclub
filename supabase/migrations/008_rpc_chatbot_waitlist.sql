-- =============================================================================
-- 008_rpc_chatbot_waitlist.sql
-- =============================================================================
-- Lógica de Persistência e Processamento da Lista de Espera (Waitlist)
-- =============================================================================
-- Permite que clientes entrem na lista de espera quando um horário desejado
-- com um barbeiro estiver esgotado, com notificação e correspondência automatizada.
-- =============================================================================

-- 1. Inserção Segura na Lista de Espera pelo Chatbot
create or replace function public.chatbot_join_waitlist(
  p_client_name text,
  p_client_phone text,
  p_barber_id uuid,
  p_barber_name text default null,
  p_service_ids uuid[] default '{}',
  p_date_key date default current_date,
  p_preferred_time time default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_waitlist_id uuid;
  v_phone_digits text;
  v_resolved_barber_name text := p_barber_name;
begin
  v_phone_digits := chatbot_phone_digits(p_client_phone);

  if length(v_phone_digits) not between 10 and 11 then
    raise exception 'invalid_phone_number' using errcode = 'P0003';
  end if;

  if p_barber_id is not null and (v_resolved_barber_name is null or v_resolved_barber_name = '') then
    select name into v_resolved_barber_name from public.barbers where id = p_barber_id;
  end if;

  insert into public.waitlist (
    client_name,
    client_phone,
    barber_id,
    barber_name,
    service_ids,
    date_key,
    preferred_time,
    status
  )
  values (
    trim(p_client_name),
    v_phone_digits,
    p_barber_id,
    coalesce(v_resolved_barber_name, 'Qualquer'),
    coalesce(p_service_ids, '{}'),
    p_date_key,
    p_preferred_time,
    'aguardando'
  )
  returning id into v_waitlist_id;

  return v_waitlist_id;
end;
$$;

-- 2. Consulta de candidatos em espera para um horário liberado
create or replace function public.chatbot_find_waitlist_candidates(
  p_barber_id uuid,
  p_date date
)
returns table (
  id uuid,
  client_name text,
  client_phone text,
  preferred_time time,
  service_ids uuid[],
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    w.id,
    w.client_name,
    w.client_phone,
    w.preferred_time,
    w.service_ids,
    w.created_at
  from public.waitlist w
  where w.status = 'aguardando'
    and w.date_key = p_date
    and (w.barber_id is null or w.barber_id = p_barber_id)
  order by w.created_at asc;
$$;

-- Permissões
revoke all on function public.chatbot_join_waitlist(text, text, uuid, text, uuid[], date, time) from public;
revoke all on function public.chatbot_find_waitlist_candidates(uuid, date) from public;

grant execute on function public.chatbot_join_waitlist(text, text, uuid, text, uuid[], date, time) to anon, authenticated;
grant execute on function public.chatbot_find_waitlist_candidates(uuid, date) to authenticated;
