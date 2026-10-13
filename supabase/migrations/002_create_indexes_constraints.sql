-- =============================================================================
-- 002_create_indexes_constraints.sql
-- =============================================================================
-- Índices de Alta Performance e Restrições de Concorrência
-- =============================================================================

-- 1. Função de normalização de telefone para indexação e consultas
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

-- 2. Índice B-Tree para busca rápida de clientes por telefone normalizado
create index if not exists idx_clients_phone_normalized
  on public.clients (chatbot_phone_digits(phone));

-- 3. Índice em appointments para busca de agendamentos por cliente (histórico e chatbot)
create index if not exists idx_appointments_client_phone_digits
  on public.appointments (chatbot_phone_digits(client_phone), appointment_date);

-- 4. Índice parcial para verificação ultrarrápida de horários ocupados por barbeiro
create index if not exists idx_appointments_barber_date_active
  on public.appointments (barber_id, appointment_date)
  where status in ('pendente', 'confirmado');

-- 5. Índice de status e data para consultas do Painel Administrativo
create index if not exists idx_appointments_date_status
  on public.appointments (appointment_date, status);

-- 6. Índices para Escalas e Exceções
create index if not exists idx_barber_schedules_lookup
  on public.barber_schedules (barber_id, day_of_week);

create index if not exists idx_barber_exceptions_lookup
  on public.barber_exceptions (barber_id, exception_date);

-- 7. Índices para Lista de Espera (Waitlist)
create index if not exists idx_waitlist_lookup
  on public.waitlist (date_key, barber_id, status);

create index if not exists idx_waitlist_client_phone
  on public.waitlist (chatbot_phone_digits(client_phone), status);

-- 8. Índice para Catálogo e Galeria
create index if not exists idx_haircut_gallery_service
  on public.haircut_gallery (service_id, is_active);

-- 9. Gatilho automático para atualização de updated_at
create or replace function public.handle_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_clients_updated_at on public.clients;
create trigger set_clients_updated_at
  before update on public.clients
  for each row execute function public.handle_updated_at();

drop trigger if exists set_appointments_updated_at on public.appointments;
create trigger set_appointments_updated_at
  before update on public.appointments
  for each row execute function public.handle_updated_at();

drop trigger if exists set_business_settings_updated_at on public.business_settings;
create trigger set_business_settings_updated_at
  before update on public.business_settings
  for each row execute function public.handle_updated_at();
