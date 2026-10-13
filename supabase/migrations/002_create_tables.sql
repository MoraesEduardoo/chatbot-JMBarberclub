-- =============================================================================
-- 002_create_tables.sql
-- =============================================================================
-- Definição estrutural estrita de todas as tabelas do ecossistema do Chatbot.
-- Inclui tipos canônicos, restrições e relacionamentos chave estrangeira.
-- =============================================================================

-- 1. Clientes (Base unificada identificada pelo telefone higienizado)
create table public.clients (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text not null unique,
    email text,
    notes text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

-- 2. Barbeiros (Profissionais ativos na barbearia)
create table public.barbers (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    phone text not null,
    avatar_url text,
    bio text,
    is_active boolean default true not null,
    display_order integer default 0 not null,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

-- 3. Serviços (Catálogo oficial com preço em centavos e duração em minutos)
create table public.services (
    id uuid primary key default gen_random_uuid(),
    name text not null,
    description text,
    price integer not null check (price >= 0), -- preço em centavos (ex: 2500 = R$ 25,00)
    duration_minutes integer not null check (duration_minutes > 0), -- tempo base em minutos
    is_active boolean default true not null,
    display_order integer default 0 not null,
    category text default 'Geral',
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

-- 4. Associação Barbeiro <-> Serviços (Personalização de preços ou tempos por profissional)
create table public.barber_services (
    id uuid primary key default gen_random_uuid(),
    barber_id uuid not null references public.barbers(id) on delete cascade,
    service_id uuid not null references public.services(id) on delete cascade,
    is_active boolean default true not null,
    custom_price integer check (custom_price is null or custom_price >= 0),
    custom_duration_minutes integer check (custom_duration_minutes is null or custom_duration_minutes > 0),
    created_at timestamp with time zone default now() not null,
    constraint uq_barber_service unique (barber_id, service_id)
);

-- 5. Expediente Semanal dos Barbeiros (0 = Domingo, 1 = Segunda ... 6 = Sábado)
create table public.barber_schedules (
    id uuid primary key default gen_random_uuid(),
    barber_id uuid not null references public.barbers(id) on delete cascade,
    day_of_week integer not null check (day_of_week between 0 and 6),
    start_time time not null,
    end_time time not null,
    break_start_time time,
    break_end_time time,
    is_working_day boolean default true not null,
    created_at timestamp with time zone default now() not null,
    constraint uq_barber_day unique (barber_id, day_of_week),
    constraint chk_schedule_order check (start_time < end_time),
    constraint chk_break_order check (
        break_start_time is null or 
        (break_end_time is not null and break_start_time < break_end_time and break_start_time >= start_time and break_end_time <= end_time)
    )
);

-- 6. Exceções de Expediente (Folgas, Feriados e Ausências)
create table public.barber_exceptions (
    id uuid primary key default gen_random_uuid(),
    barber_id uuid not null references public.barbers(id) on delete cascade,
    exception_date date not null,
    is_available boolean default false not null,
    start_time time,
    end_time time,
    reason text,
    created_at timestamp with time zone default now() not null,
    constraint uq_barber_exception unique (barber_id, exception_date)
);

-- 7. Galeria de Cortes (Apresentação de estilos e fotos no Chatbot e PWA)
create table public.haircut_gallery (
    id uuid primary key default gen_random_uuid(),
    title text not null,
    category text default 'Degradê' not null,
    image_url text not null,
    description text,
    barber_id uuid references public.barbers(id) on delete set null,
    is_active boolean default true not null,
    display_order integer default 0 not null,
    created_at timestamp with time zone default now() not null
);

-- 8. Agendamentos (Motor transacional central do Chatbot)
create table public.appointments (
    id uuid primary key default gen_random_uuid(),
    client_id uuid not null references public.clients(id) on delete restrict,
    barber_id uuid not null references public.barbers(id) on delete restrict,
    service_id uuid not null references public.services(id) on delete restrict,
    client_name text not null,
    client_phone text not null,
    appointment_date date not null,
    appointment_time time not null,
    appointment_end_time time not null,
    duration_minutes integer not null default 30 check (duration_minutes > 0),
    total_price integer not null default 0 check (total_price >= 0),
    status text not null default 'confirmed' check (status in ('confirmed', 'completed', 'canceled', 'no_show')),
    notes text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);

-- 9. Lista de Espera Inteligente (Waitlist para datas e horários esgotados)
create table public.waitlist (
    id uuid primary key default gen_random_uuid(),
    client_id uuid references public.clients(id) on delete cascade,
    client_name text not null,
    client_phone text not null,
    barber_id uuid not null references public.barbers(id) on delete cascade,
    service_id uuid references public.services(id) on delete set null,
    service_name text,
    service_ids uuid[] default '{}'::uuid[],
    desired_date date not null,
    desired_time time,
    status text default 'waiting' check (status in ('waiting', 'notified', 'booked', 'expired', 'canceled')),
    notes text,
    created_at timestamp with time zone default now() not null,
    updated_at timestamp with time zone default now() not null
);
