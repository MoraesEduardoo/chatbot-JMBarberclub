-- =============================================================================
-- 005_security_rls_policies.sql
-- =============================================================================
-- Configuração de Row Level Security (RLS) estrita com permissões públicas de
-- leitura para o ecossistema do Chatbot e inserção/atualização controlada.
-- =============================================================================

-- Habilitação de RLS em todas as tabelas
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.barber_services enable row level security;
alter table public.barber_schedules enable row level security;
alter table public.barber_exceptions enable row level security;
alter table public.haircut_gallery enable row level security;
alter table public.clients enable row level security;
alter table public.appointments enable row level security;
alter table public.waitlist enable row level security;

-- 1. Políticas para Barbeiros, Serviços, Horários e Galeria (Leitura Pública para Chatbot e PWA)
create policy "Allow public read barbers"
on public.barbers for select
using (true);

create policy "Allow public read services"
on public.services for select
using (true);

create policy "Allow public read barber_services"
on public.barber_services for select
using (true);

create policy "Allow public read barber_schedules"
on public.barber_schedules for select
using (true);

create policy "Allow public read barber_exceptions"
on public.barber_exceptions for select
using (true);

create policy "Allow public read haircut_gallery"
on public.haircut_gallery for select
using (true);

-- 2. Políticas para Clientes
create policy "Allow public read clients by phone"
on public.clients for select
using (true);

create policy "Allow public insert clients"
on public.clients for insert
with check (true);

create policy "Allow public update clients"
on public.clients for update
using (true);

-- 3. Políticas para Agendamentos
create policy "Allow public read appointments"
on public.appointments for select
using (true);

create policy "Allow public insert appointments"
on public.appointments for insert
with check (true);

create policy "Allow public update appointments"
on public.appointments for update
using (true);

-- 4. Políticas para Waitlist
create policy "Allow public insert waitlist"
on public.waitlist for insert
with check (true);

create policy "Allow public read waitlist"
on public.waitlist for select
using (true);

-- 5. Concessões de privilégios para as roles públicas do Supabase (anon e authenticated)
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to anon, authenticated;
grant insert, update on public.clients to anon, authenticated;
grant insert, update on public.appointments to anon, authenticated;
grant insert, update on public.waitlist to anon, authenticated;
grant usage, select on all sequences in schema public to anon, authenticated;
