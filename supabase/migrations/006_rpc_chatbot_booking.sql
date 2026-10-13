-- =============================================================================
-- 006_rpc_chatbot_booking.sql
-- =============================================================================
-- Função RPC Transacional: Criação Atômica de Agendamentos (Chatbot PWA)
-- =============================================================================
-- Regras de Negócio e Segurança:
-- 1. Serialização de concorrência com FOR UPDATE no barbeiro (previne double-booking).
-- 2. Validação estrita de Antecedência Mínima (30 minutos) e Máxima (30 dias).
-- 3. Soma dinâmica de durações de múltiplos serviços selecionados.
-- 4. Inclusão de Buffer Técnico (10 min) na verificação de sobreposição.
-- 5. Cadastro/Atualização idempotente do cliente na tabela `clients`.
-- 6. Atomicidade completa: ou todos os serviços são agendados ou nenhum é gravado.
-- =============================================================================

create or replace function public.chatbot_create_appointments(
  p_barber_id uuid,
  p_service_ids uuid[],
  p_client_name text,
  p_client_phone text,
  p_appointment_at timestamptz
)
returns uuid[]
language plpgsql
security definer
set search_path = public
as $$
declare
  v_client_id uuid;
  v_phone_digits text;
  v_now timestamptz := now();
  v_min_lead integer;
  v_max_days integer;
  v_buffer_minutes integer;
  v_created_ids uuid[] := '{}';
  v_current_start timestamptz;
  v_total_duration integer := 0;
  v_service_id uuid;
  v_duration integer;
  v_price numeric(10,2);
  v_new_apt_id uuid;
begin
  -- 1. Validações preliminares de parâmetros
  v_phone_digits := chatbot_phone_digits(p_client_phone);
  if length(v_phone_digits) not between 10 and 11 then
    raise exception 'invalid_phone_number' using errcode = 'P0003';
  end if;

  if coalesce(array_length(p_service_ids, 1), 0) = 0 then
    raise exception 'no_services_selected' using errcode = 'P0004';
  end if;

  -- 2. Carrega parâmetros de configuração do negócio
  select coalesce(nullif(value, '')::integer, 30) into v_min_lead
    from public.business_settings where key = 'min_lead_minutes';
  v_min_lead := coalesce(v_min_lead, 30);

  select coalesce(nullif(value, '')::integer, 30) into v_max_days
    from public.business_settings where key = 'max_future_days';
  v_max_days := coalesce(v_max_days, 30);

  select coalesce(nullif(value, '')::integer, 10) into v_buffer_minutes
    from public.business_settings where key = 'cleaning_buffer_minutes';
  v_buffer_minutes := coalesce(v_buffer_minutes, 10);

  -- Regra 1: Antecedência Mínima (30 min) e Antecedência Máxima (30 dias)
  if p_appointment_at < (v_now + (v_min_lead * interval '1 minute')) then
    raise exception 'lead_time_insufficient' using errcode = 'P0005';
  end if;

  if p_appointment_at > (v_now + (v_max_days * interval '1 day')) then
    raise exception 'booking_window_exceeded' using errcode = 'P0006';
  end if;

  -- 3. Trava de Concorrência: Bloqueia a linha do barbeiro para serializar
  -- transações simultâneas de agendamento sem risco de double-booking
  perform 1 from public.barbers where id = p_barber_id for update;

  -- 4. Cadastro / Atualização do Cliente
  insert into public.clients (name, phone)
  values (trim(p_client_name), v_phone_digits)
  on conflict (phone) do update set
    name = excluded.name,
    updated_at = now()
  returning id into v_client_id;

  -- 5. Calcula a duração total e verifica sobreposição do bloco inteiro + buffer
  for i in 1..array_length(p_service_ids, 1) loop
    v_service_id := p_service_ids[i];
    
    select
      coalesce(bs.custom_duration_minutes, s.default_duration_minutes, 30)
    into v_duration
    from public.services s
    left join public.barber_services bs
      on bs.service_id = s.id and bs.barber_id = p_barber_id
    where s.id = v_service_id;

    if v_duration is null then
      v_duration := 30;
    end if;

    v_total_duration := v_total_duration + v_duration;
  end loop;

  -- Verifica se algum agendamento ativo colide com o bloco solicitado
  -- (Novo intervalo: p_appointment_at até p_appointment_at + v_total_duration + buffer)
  if exists (
    select 1
    from public.appointments a
    where a.barber_id = p_barber_id
      and a.status in ('pendente', 'confirmado')
      and (
        -- Intervalo A sobrepõe Intervalo B se StartA < EndB AND EndA > StartB
        a.appointment_date < (p_appointment_at + ((v_total_duration + v_buffer_minutes) * interval '1 minute'))
        and
        (a.appointment_date + ((coalesce(a.duration_minutes, 30) + v_buffer_minutes) * interval '1 minute')) > p_appointment_at
      )
  ) then
    raise exception 'slot_already_booked' using errcode = '23505';
  end if;

  -- 6. Inserção atômica de cada procedimento no horário sequencial correspondente
  v_current_start := p_appointment_at;

  for i in 1..array_length(p_service_ids, 1) loop
    v_service_id := p_service_ids[i];

    select
      coalesce(bs.custom_duration_minutes, s.default_duration_minutes, 30),
      coalesce(bs.custom_price, s.price, 0.00)
    into v_duration, v_price
    from public.services s
    left join public.barber_services bs
      on bs.service_id = s.id and bs.barber_id = p_barber_id
    where s.id = v_service_id;

    if v_duration is null then
      v_duration := 30;
    end if;

    insert into public.appointments (
      barber_id,
      service_id,
      client_id,
      client_name,
      client_phone,
      appointment_date,
      duration_minutes,
      price,
      status
    )
    values (
      p_barber_id,
      v_service_id,
      v_client_id,
      trim(p_client_name),
      v_phone_digits,
      v_current_start,
      v_duration,
      v_price,
      'confirmado'
    )
    returning id into v_new_apt_id;

    v_created_ids := array_append(v_created_ids, v_new_apt_id);

    -- O próximo serviço inicia exatamente quando o atual termina
    v_current_start := v_current_start + (v_duration * interval '1 minute');
  end loop;

  return v_created_ids;
end;
$$;

-- Permissões
revoke all on function public.chatbot_create_appointments(uuid, uuid[], text, text, timestamptz) from public;
grant execute on function public.chatbot_create_appointments(uuid, uuid[], text, text, timestamptz) to anon, authenticated;
