-- =============================================================================
-- 007_rpc_chatbot_management.sql
-- =============================================================================
-- Funções RPC Transacionais de Gestão pelo Cliente (Chatbot PWA)
-- =============================================================================
-- Regras de Negócio e Segurança:
-- 1. chatbot_list_appointments: lista agendamentos ativos do cliente.
-- 2. chatbot_cancel_appointments: CANCELAMENTO TOTALMENTE LIVRE E AUTÔNOMO.
--    Sem travas de antecedência mínima ou penalizações, conforme a Regra de Negócio 2.
-- 3. chatbot_reschedule_appointments: desloca atômica e confiavelmente todos os serviços
--    do agendamento para o novo horário escolhido, verificando colisão com outros clientes.
-- =============================================================================

-- 1. Listar Agendamentos do Cliente
create or replace function public.chatbot_list_appointments(p_phone text)
returns table (
  id               uuid,
  barber_id        uuid,
  barber_name      text,
  service_id       uuid,
  service_name     text,
  appointment_date timestamptz,
  status           text,
  created_at       timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.barber_id,
    b.name as barber_name,
    a.service_id,
    s.name as service_name,
    a.appointment_date,
    a.status,
    a.created_at
  from public.appointments a
  left join public.barbers  b on b.id = a.barber_id
  left join public.services s on s.id = a.service_id
  where length(chatbot_phone_digits(p_phone)) between 10 and 11
    and chatbot_phone_digits(a.client_phone) = chatbot_phone_digits(p_phone)
    and a.status in ('pendente', 'confirmado')
    and a.appointment_date >= now() - interval '30 minutes'
  order by a.appointment_date asc, a.created_at asc;
$$;

-- 2. Cancelar Agendamento (Cancelamento Livre e Autônomo)
create or replace function public.chatbot_cancel_appointments(
  p_ids uuid[],
  p_phone text
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
  v_phone_digits text;
begin
  v_phone_digits := chatbot_phone_digits(p_phone);

  if coalesce(array_length(p_ids, 1), 0) = 0 or length(v_phone_digits) not between 10 and 11 then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  -- Atualiza o status para 'cancelado' de forma irrestrita para as linhas do cliente
  update public.appointments a
     set status = 'cancelado',
         updated_at = now()
   where a.id = any (p_ids)
     and chatbot_phone_digits(a.client_phone) = v_phone_digits
     and a.status in ('pendente', 'confirmado');

  get diagnostics v_count = row_count;

  -- Garantia tudo-ou-nada: todos os ids especificados devem pertencer ao cliente
  if v_count <> array_length(p_ids, 1) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  return v_count;
end;
$$;

-- 3. Remarcação Segura de Agendamento
create or replace function public.chatbot_reschedule_appointments(
  p_ids uuid[],
  p_phone text,
  p_new_at timestamptz
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first timestamptz;
  v_delta interval;
  v_count integer;
  v_barber_id uuid;
  v_phone_digits text;
  v_min_lead integer;
  v_max_days integer;
begin
  v_phone_digits := chatbot_phone_digits(p_phone);

  if coalesce(array_length(p_ids, 1), 0) = 0 or length(v_phone_digits) not between 10 and 11 then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  -- Validação de antecedência do novo horário
  select coalesce(nullif(value, '')::integer, 30) into v_min_lead
    from public.business_settings where key = 'min_lead_minutes';
  v_min_lead := coalesce(v_min_lead, 30);

  select coalesce(nullif(value, '')::integer, 30) into v_max_days
    from public.business_settings where key = 'max_future_days';
  v_max_days := coalesce(v_max_days, 30);

  if p_new_at < (now() + (v_min_lead * interval '1 minute')) then
    raise exception 'lead_time_insufficient' using errcode = 'P0005';
  end if;

  if p_new_at > (now() + (v_max_days * interval '1 day')) then
    raise exception 'booking_window_exceeded' using errcode = 'P0006';
  end if;

  -- Bloqueia as linhas do agendamento para evitar concorrência simultânea
  perform a.id
     from public.appointments a
    where a.id = any (p_ids)
      and chatbot_phone_digits(a.client_phone) = v_phone_digits
      and a.status in ('pendente', 'confirmado')
      for update;

  -- Determina o início atual e quantidade de serviços
  select min(a.appointment_date), count(*), min(a.barber_id)
    into v_first, v_count, v_barber_id
    from public.appointments a
   where a.id = any (p_ids)
     and chatbot_phone_digits(a.client_phone) = v_phone_digits
     and a.status in ('pendente', 'confirmado');

  if v_count is distinct from array_length(p_ids, 1) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  -- Serializa com o barbeiro correspondente
  perform 1 from public.barbers where id = v_barber_id for update;

  v_delta := p_new_at - v_first;

  -- Verifica se o novo horário colide com agendamentos de outros clientes
  if exists (
    select 1
      from public.appointments a
      join public.appointments o
        on o.barber_id = a.barber_id
       and o.status in ('pendente', 'confirmado')
       and o.appointment_date = a.appointment_date + v_delta
       and o.id <> all (p_ids)
     where a.id = any (p_ids)
  ) then
    raise exception 'slot_already_booked' using errcode = '23505';
  end if;

  -- Desloca todas as linhas mantendo os intervalos sequenciais
  update public.appointments
     set appointment_date = appointment_date + v_delta,
         status = 'confirmado',
         updated_at = now()
   where id = any (p_ids);

  return v_count;
end;
$$;

-- Permissões de Execução
revoke all on function public.chatbot_list_appointments(text) from public;
revoke all on function public.chatbot_cancel_appointments(uuid[], text) from public;
revoke all on function public.chatbot_reschedule_appointments(uuid[], text, timestamptz) from public;

grant execute on function public.chatbot_list_appointments(text) to anon, authenticated;
grant execute on function public.chatbot_cancel_appointments(uuid[], text) to anon, authenticated;
grant execute on function public.chatbot_reschedule_appointments(uuid[], text, timestamptz) to anon, authenticated;
