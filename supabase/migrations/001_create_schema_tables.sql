-- =============================================================================
-- 001_create_schema_tables.sql
-- =============================================================================
-- Criação de todas as tabelas do ecossistema JM Barberclub:
-- - Gestão de Agendamentos (appointments, waitlist, business_settings)
-- - Profissionais e Escalas (barbers, barber_schedules, barber_exceptions)
-- - Catálogo de Procedimentos (services, barber_services, haircut_gallery)
-- - Clientes, Avaliações e Notificações (clients, client_feedbacks, push_subscriptions)
-- - Controle Financeiro e Autenticação (cash_flow, barber_recovery_codes, barber_recovery_state)
-- =============================================================================

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 1. Clientes
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text not null unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Barbeiros (Profissionais)
create table if not exists public.barbers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  avatar_url text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 3. Serviços Oferecidos
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(10,2) not null check (price >= 0),
  default_duration_minutes integer not null default 30 check (default_duration_minutes > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 4. Associação Barbeiro <-> Serviços (Habilidades, Duração e Preço Customizados)
create table if not exists public.barber_services (
  barber_id uuid not null references public.barbers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete cascade,
  custom_duration_minutes integer check (custom_duration_minutes > 0),
  custom_price numeric(10,2) check (custom_price >= 0),
  created_at timestamptz not null default now(),
  primary key (barber_id, service_id)
);

-- 5. Escala Semanal de Atendimento dos Barbeiros
create table if not exists public.barber_schedules (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  day_of_week integer not null check (day_of_week between 0 and 6), -- 0=Domingo ... 6=Sábado
  is_working boolean not null default true,
  start_time time not null default '09:00',
  end_time time not null default '19:00',
  lunch_start time,
  lunch_end time,
  created_at timestamptz not null default now(),
  unique (barber_id, day_of_week)
);

-- 6. Bloqueios e Folgas Pontuais (Exceções de Agenda)
create table if not exists public.barber_exceptions (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  exception_date date not null,
  is_closed boolean not null default true,
  start_time time,
  end_time time,
  reason text,
  created_at timestamptz not null default now()
);

-- 7. Agendamentos
create table if not exists public.appointments (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  service_id uuid not null references public.services(id) on delete restrict,
  client_id uuid references public.clients(id) on delete set null,
  client_name text not null,
  client_phone text not null,
  appointment_date timestamptz not null,
  duration_minutes integer not null default 30 check (duration_minutes > 0),
  status text not null default 'pendente' check (status in ('pendente', 'confirmado', 'cancelado', 'finalizado', 'no_show')),
  price numeric(10,2),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 8. Lista de Espera Automatizada (Waitlist)
create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  client_name text not null,
  client_phone text not null,
  barber_id uuid references public.barbers(id) on delete set null,
  barber_name text default 'Qualquer',
  service_ids uuid[] default '{}',
  date_key date not null,
  preferred_time time,
  status text not null default 'aguardando' check (status in ('aguardando', 'notificado', 'agendado', 'cancelado')),
  created_at timestamptz not null default now()
);

-- 9. Configurações Globais do Negócio
create table if not exists public.business_settings (
  key text primary key,
  value text not null,
  description text,
  updated_at timestamptz not null default now()
);

-- 10. Galeria de Fotos de Cortes
create table if not exists public.haircut_gallery (
  id uuid primary key default gen_random_uuid(),
  service_id uuid references public.services(id) on delete set null,
  barber_id uuid references public.barbers(id) on delete set null,
  title text not null,
  category text,
  image_path text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- 11. Controle Financeiro (Fluxo de Caixa)
create table if not exists public.cash_flow (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid references public.barbers(id) on delete set null,
  appointment_id uuid references public.appointments(id) on delete set null,
  amount numeric(10,2) not null,
  type text not null check (type in ('entrada', 'saida')),
  description text,
  category text,
  payment_method text,
  created_at timestamptz not null default now()
);

-- 12. Avaliações e Feedbacks dos Clientes
create table if not exists public.client_feedbacks (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid references public.appointments(id) on delete set null,
  client_phone text,
  rating integer not null check (rating between 1 and 5),
  comment text,
  created_at timestamptz not null default now()
);

-- 13. Inscrições Push Notification PWA
create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  client_phone text,
  barber_id uuid references public.barbers(id) on delete set null,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now()
);

-- 14. Códigos de Recuperação e Segurança de Barbeiros
create table if not exists public.barber_recovery_codes (
  id uuid primary key default gen_random_uuid(),
  barber_id uuid not null references public.barbers(id) on delete cascade,
  code_hash text not null,
  expires_at timestamptz not null,
  used boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.barber_recovery_state (
  barber_id uuid primary key references public.barbers(id) on delete cascade,
  attempts integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);
