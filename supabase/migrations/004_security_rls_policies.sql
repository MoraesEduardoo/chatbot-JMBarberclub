-- =============================================================================
-- 004_security_rls_policies.sql
-- =============================================================================
-- Configuração de Row Level Security (RLS) e Políticas de Acesso
-- =============================================================================
-- Diretriz Arquitetural:
-- - Chave anônima (anon): acesso de LEITURA apenas ao catálogo público
--   (serviços, fotos, barbeiros, horários de funcionamento e configurações).
-- - Toda gravação e consulta de agendamentos pelo Chatbot PWA é realizada através
--   de funções transacionais seguras (SECURITY DEFINER) que validam o telefone.
-- - Usuários autenticados (authenticated): acesso irrestrito para gestão no Painel Administrativo.
-- =============================================================================

-- Habilita RLS em todas as tabelas
alter table public.clients enable row level security;
alter table public.barbers enable row level security;
alter table public.services enable row level security;
alter table public.barber_services enable row level security;
alter table public.barber_schedules enable row level security;
alter table public.barber_exceptions enable row level security;
alter table public.appointments enable row level security;
alter table public.waitlist enable row level security;
alter table public.business_settings enable row level security;
alter table public.haircut_gallery enable row level security;
alter table public.cash_flow enable row level security;
alter table public.client_feedbacks enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.barber_recovery_codes enable row level security;
alter table public.barber_recovery_state enable row level security;

-- -----------------------------------------------------------------------------
-- 1. Políticas de Catálogo Público (Leitura Livre para PWA, Escrita para Admin)
-- -----------------------------------------------------------------------------

-- Barbers
drop policy if exists "Leitura pública de barbeiros ativos" on public.barbers;
create policy "Leitura pública de barbeiros ativos"
  on public.barbers for select
  to anon, authenticated
  using (is_active = true or auth.role() = 'authenticated');

drop policy if exists "Gestão completa de barbeiros para admin" on public.barbers;
create policy "Gestão completa de barbeiros para admin"
  on public.barbers for all
  to authenticated
  using (true) with check (true);

-- Services
drop policy if exists "Leitura pública de serviços ativos" on public.services;
create policy "Leitura pública de serviços ativos"
  on public.services for select
  to anon, authenticated
  using (is_active = true or auth.role() = 'authenticated');

drop policy if exists "Gestão completa de serviços para admin" on public.services;
create policy "Gestão completa de serviços para admin"
  on public.services for all
  to authenticated
  using (true) with check (true);

-- Barber Services
drop policy if exists "Leitura pública de vínculos barbeiro-serviço" on public.barber_services;
create policy "Leitura pública de vínculos barbeiro-serviço"
  on public.barber_services for select
  to anon, authenticated
  using (true);

drop policy if exists "Gestão de vínculos para admin" on public.barber_services;
create policy "Gestão de vínculos para admin"
  on public.barber_services for all
  to authenticated
  using (true) with check (true);

-- Barber Schedules
drop policy if exists "Leitura pública de escalas de barbeiros" on public.barber_schedules;
create policy "Leitura pública de escalas de barbeiros"
  on public.barber_schedules for select
  to anon, authenticated
  using (true);

drop policy if exists "Gestão de escalas para admin" on public.barber_schedules;
create policy "Gestão de escalas para admin"
  on public.barber_schedules for all
  to authenticated
  using (true) with check (true);

-- Barber Exceptions
drop policy if exists "Leitura pública de exceções de expediente" on public.barber_exceptions;
create policy "Leitura pública de exceções de expediente"
  on public.barber_exceptions for select
  to anon, authenticated
  using (true);

drop policy if exists "Gestão de exceções para admin" on public.barber_exceptions;
create policy "Gestão de exceções para admin"
  on public.barber_exceptions for all
  to authenticated
  using (true) with check (true);

-- Haircut Gallery
drop policy if exists "Leitura pública da galeria de cortes" on public.haircut_gallery;
create policy "Leitura pública da galeria de cortes"
  on public.haircut_gallery for select
  to anon, authenticated
  using (is_active = true or auth.role() = 'authenticated');

drop policy if exists "Gestão da galeria para admin" on public.haircut_gallery;
create policy "Gestão da galeria para admin"
  on public.haircut_gallery for all
  to authenticated
  using (true) with check (true);

-- Business Settings
drop policy if exists "Leitura pública de configurações do negócio" on public.business_settings;
create policy "Leitura pública de configurações do negócio"
  on public.business_settings for select
  to anon, authenticated
  using (true);

drop policy if exists "Gestão de configurações para admin" on public.business_settings;
create policy "Gestão de configurações para admin"
  on public.business_settings for all
  to authenticated
  using (true) with check (true);

-- -----------------------------------------------------------------------------
-- 2. Políticas de Dados Sensíveis (Appointments, Clients, Cash Flow)
-- -----------------------------------------------------------------------------

-- Appointments: Anon não faz SELECT/INSERT/UPDATE direto. Apenas via RPCs seguras.
drop policy if exists "Admin gerencia todos os agendamentos" on public.appointments;
create policy "Admin gerencia todos os agendamentos"
  on public.appointments for all
  to authenticated
  using (true) with check (true);

-- Clients: Acesso completo para admin
drop policy if exists "Admin gerencia cadastro de clientes" on public.clients;
create policy "Admin gerencia cadastro de clientes"
  on public.clients for all
  to authenticated
  using (true) with check (true);

-- Cash Flow: Apenas admin autenticado
drop policy if exists "Admin gerencia fluxo de caixa" on public.cash_flow;
create policy "Admin gerencia fluxo de caixa"
  on public.cash_flow for all
  to authenticated
  using (true) with check (true);

-- Waitlist: Inserção pelo chatbot (ou RPC) e gestão pelo admin
drop policy if exists "Inserção na lista de espera" on public.waitlist;
create policy "Inserção na lista de espera"
  on public.waitlist for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admin gerencia lista de espera" on public.waitlist;
create policy "Admin gerencia lista de espera"
  on public.waitlist for all
  to authenticated
  using (true) with check (true);

-- Feedbacks: Inserção pelo cliente e leitura/gestão pelo admin
drop policy if exists "Envio de feedback pelo cliente" on public.client_feedbacks;
create policy "Envio de feedback pelo cliente"
  on public.client_feedbacks for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admin visualiza feedbacks" on public.client_feedbacks;
create policy "Admin visualiza feedbacks"
  on public.client_feedbacks for select
  to authenticated
  using (true);

-- Push Subscriptions: Inscrição pelo navegador e gestão para envio
drop policy if exists "Registro de push notification" on public.push_subscriptions;
create policy "Registro de push notification"
  on public.push_subscriptions for insert
  to anon, authenticated
  with check (true);

drop policy if exists "Admin gerencia push subscriptions" on public.push_subscriptions;
create policy "Admin gerencia push subscriptions"
  on public.push_subscriptions for all
  to authenticated
  using (true) with check (true);
