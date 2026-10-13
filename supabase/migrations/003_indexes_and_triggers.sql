-- =============================================================================
-- 003_indexes_and_triggers.sql
-- =============================================================================
-- Índices B-Tree de alta performance para buscas em tempo real do Chatbot
-- e Triggers para automação de timestamps atualizados.
-- =============================================================================

-- 1. Índices para Otimização de Consultas de Disponibilidade
create index if not exists idx_appointments_lookup 
on public.appointments(barber_id, appointment_date, status);

create index if not exists idx_appointments_client_phone 
on public.appointments(client_phone, status);

create index if not exists idx_appointments_date_time
on public.appointments(appointment_date, appointment_time);

create index if not exists idx_clients_phone 
on public.clients(phone);

create index if not exists idx_services_active_order 
on public.services(is_active, display_order);

create index if not exists idx_barbers_active_order 
on public.barbers(is_active, display_order);

create index if not exists idx_barber_schedules_lookup 
on public.barber_schedules(barber_id, day_of_week);

create index if not exists idx_barber_exceptions_lookup 
on public.barber_exceptions(barber_id, exception_date);

create index if not exists idx_waitlist_lookup 
on public.waitlist(barber_id, desired_date, status);

-- 2. Triggers para Atualização Automática de updated_at
drop trigger if exists trg_clients_updated_at on public.clients;
create trigger trg_clients_updated_at
    before update on public.clients
    for each row
    execute function public.set_updated_at();

drop trigger if exists trg_barbers_updated_at on public.barbers;
create trigger trg_barbers_updated_at
    before update on public.barbers
    for each row
    execute function public.set_updated_at();

drop trigger if exists trg_services_updated_at on public.services;
create trigger trg_services_updated_at
    before update on public.services
    for each row
    execute function public.set_updated_at();

drop trigger if exists trg_appointments_updated_at on public.appointments;
create trigger trg_appointments_updated_at
    before update on public.appointments
    for each row
    execute function public.set_updated_at();

drop trigger if exists trg_waitlist_updated_at on public.waitlist;
create trigger trg_waitlist_updated_at
    before update on public.waitlist
    for each row
    execute function public.set_updated_at();
