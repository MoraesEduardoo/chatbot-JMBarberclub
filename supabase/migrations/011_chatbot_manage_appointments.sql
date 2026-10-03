-- =============================================================================
-- 011 — Chatbot: consultar, cancelar e remarcar agendamentos (RPCs seguras)
-- =============================================================================
-- ⚠️  RASCUNHO PARA REVISÃO — escrito SEM acesso ao seu schema real nem à migração 010.
--     Antes de rodar em produção, confira os pontos marcados com «VERIFIQUE»
--     e teste em um projeto/branch de desenvolvimento do Supabase.
--
-- Por que RPCs? A migração 003 do painel ligou o RLS em `appointments`. O chat usa a
-- chave anônima, então toda escrita (e, idealmente, toda leitura) passa por funções
-- SECURITY DEFINER que validam o telefone do cliente. O chat deixa de fazer SELECT
-- direto na tabela — dá para fechar o SELECT anônimo sem quebrar nada (ver README).
--
-- Já existem (010): chatbot_booked_times, chatbot_create_appointments.
-- Esta migração cria: chatbot_list_appointments, chatbot_cancel_appointments,
--                     chatbot_reschedule_appointments.
--
-- ⚠️  LIMITAÇÃO DE SEGURANÇA: o "login" do cliente é o telefone. Quem souber o número
--     de alguém consegue ver/cancelar/remarcar os horários dele. Para a escala de uma
--     barbearia é um risco aceitável, mas o caminho correto a longo prazo é verificar
--     o telefone (OTP por WhatsApp/SMS) ou usar Supabase Auth.
-- =============================================================================

-- Normaliza telefone: só dígitos, sem o 55 do país.
create or replace function public.chatbot_phone_digits(p text)
returns text
language sql
immutable
as $$
  select case
           when length(d) in (12, 13) and left(d, 2) = '55' then substring(d from 3)
           else d
         end
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) s
$$;

-- -----------------------------------------------------------------------------
-- Lista agendamentos ATIVOS e futuros do telefone (1 linha por serviço).
-- VERIFIQUE: nomes das colunas (client_phone, appointment_date, status, created_at)
--            e os tipos de id (uuid).
-- -----------------------------------------------------------------------------
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
  select a.id, a.barber_id, b.name, a.service_id, s.name, a.appointment_date, a.status, a.created_at
  from appointments a
  left join barbers  b on b.id = a.barber_id
  left join services s on s.id = a.service_id
  where length(chatbot_phone_digits(p_phone)) between 10 and 11
    and chatbot_phone_digits(a.client_phone) = chatbot_phone_digits(p_phone)
    and a.status in ('pendente', 'confirmado')               -- VERIFIQUE os valores de status do painel
    and a.appointment_date >= now() - interval '30 minutes'  -- inclui quem acabou de começar
  order by a.appointment_date, a.created_at, a.id
$$;

-- -----------------------------------------------------------------------------
-- Cancela uma reserva (todas as linhas dela). Só mexe em linhas do telefone informado.
-- VERIFIQUE: o painel usa 'cancelado' (e não 'cancelled'/'cancelada')? Há CHECK em status?
-- VERIFIQUE: índice único. Se existir UNIQUE (barber_id, appointment_date) NÃO parcial,
--   o horário cancelado continuará "ocupado" para novas reservas (erro 23505). Solução:
--
--     drop index if exists <nome_do_indice_atual>;
--     create unique index appointments_barber_slot_active
--       on appointments (barber_id, appointment_date)
--       where status in ('pendente', 'confirmado');
--
--   Confira também se chatbot_booked_times ignora status 'cancelado'.
-- -----------------------------------------------------------------------------
create or replace function public.chatbot_cancel_appointments(p_ids uuid[], p_phone text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 or length(chatbot_phone_digits(p_phone)) not between 10 and 11 then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  update appointments a
     set status = 'cancelado'
   where a.id = any (p_ids)
     and chatbot_phone_digits(a.client_phone) = chatbot_phone_digits(p_phone)
     and a.status in ('pendente', 'confirmado')
     and a.appointment_date >= now() - interval '30 minutes';

  get diagnostics v_count = row_count;

  -- Tudo-ou-nada: se alguma linha não era do cliente/ativa, desfaz.
  if v_count <> array_length(p_ids, 1) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  return v_count;
end;
$$;

-- -----------------------------------------------------------------------------
-- Remarca: desloca TODAS as linhas da reserva pelo mesmo intervalo, preservando o
-- espaçamento entre os serviços. O novo início corresponde à PRIMEIRA linha.
-- Conflito (mesmo barbeiro + mesmo início de OUTRA reserva ativa) → erro 23505,
-- que o chat traduz em "horário acabou de ser reservado".
-- VERIFIQUE: se a tabela guarda hora em coluna separada (ex.: appointment_time) além de
--   appointment_date, atualize-a também (veja o comentário no UPDATE).
-- VERIFIQUE: voltar o status para 'pendente' é a regra certa para o seu fluxo
--   (o barbeiro reconfirma o novo horário)?
-- -----------------------------------------------------------------------------
create or replace function public.chatbot_reschedule_appointments(p_ids uuid[], p_phone text, p_new_at timestamptz)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_first timestamptz;
  v_delta interval;
  v_count integer;
begin
  if coalesce(array_length(p_ids, 1), 0) = 0 or length(chatbot_phone_digits(p_phone)) not between 10 and 11 then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;
  if p_new_at <= now() then
    raise exception 'appointment_in_past' using errcode = 'P0001';
  end if;

  -- Trava as linhas da reserva (evita duas remarcações/cancelamentos simultâneos).
  -- FOR UPDATE não pode ser combinado com agregação, por isso são dois passos.
  perform a.id
     from appointments a
    where a.id = any (p_ids)
      and chatbot_phone_digits(a.client_phone) = chatbot_phone_digits(p_phone)
      and a.status in ('pendente', 'confirmado')
      and a.appointment_date >= now() - interval '30 minutes'
      for update;

  select min(a.appointment_date), count(*)
    into v_first, v_count
    from appointments a
   where a.id = any (p_ids)
     and chatbot_phone_digits(a.client_phone) = chatbot_phone_digits(p_phone)
     and a.status in ('pendente', 'confirmado')
     and a.appointment_date >= now() - interval '30 minutes';

  if v_count is distinct from array_length(p_ids, 1) then
    raise exception 'appointment_not_found' using errcode = 'P0002';
  end if;

  v_delta := p_new_at - v_first;

  if exists (
    select 1
      from appointments a
      join appointments o
        on o.barber_id = a.barber_id
       and o.status in ('pendente', 'confirmado')
       and o.appointment_date = a.appointment_date + v_delta
       and o.id <> all (p_ids)
     where a.id = any (p_ids)
  ) then
    raise exception 'slot_taken' using errcode = '23505';
  end if;

  update appointments
     set appointment_date = appointment_date + v_delta,
         -- appointment_time = (appointment_date + v_delta)::time,   -- ← só se existir coluna separada
         status = 'pendente'
   where id = any (p_ids);

  return v_count;
end;
$$;

-- Permissões: só o necessário para a chave anônima/autenticada.
revoke all on function public.chatbot_list_appointments(text)                      from public;
revoke all on function public.chatbot_cancel_appointments(uuid[], text)            from public;
revoke all on function public.chatbot_reschedule_appointments(uuid[], text, timestamptz) from public;
grant execute on function public.chatbot_list_appointments(text)                      to anon, authenticated;
grant execute on function public.chatbot_cancel_appointments(uuid[], text)            to anon, authenticated;
grant execute on function public.chatbot_reschedule_appointments(uuid[], text, timestamptz) to anon, authenticated;
