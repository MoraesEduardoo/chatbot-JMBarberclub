-- =============================================================================
-- 001_drop_and_extensions.sql
-- =============================================================================
-- Limpeza completa prévia (DROP CASCADE em ordem reversa estrita)
-- e habilitação das extensões PostgreSQL necessárias.
-- =============================================================================

-- 1. Remoção de Triggers e Funções auxiliares caso existam
drop function if exists public.set_updated_at() cascade;
drop function if exists public.chatbot_booked_times(uuid, date) cascade;
drop function if exists public.chatbot_create_appointments(text, text, uuid, uuid[], date, time, text) cascade;
drop function if exists public.chatbot_list_appointments(text) cascade;
drop function if exists public.chatbot_cancel_appointments(text, uuid, text) cascade;
drop function if exists public.chatbot_reschedule_appointments(text, uuid, date, time) cascade;
drop function if exists public.chatbot_join_waitlist(text, text, uuid, text, uuid[], date, time) cascade;
drop function if exists public.chatbot_find_waitlist_candidates(uuid, date) cascade;

-- 2. DROP CASCADE das tabelas em ordem reversa de dependência referencial
drop table if exists public.waitlist cascade;
drop table if exists public.appointments cascade;
drop table if exists public.haircut_gallery cascade;
drop table if exists public.barber_exceptions cascade;
drop table if exists public.barber_schedules cascade;
drop table if exists public.barber_services cascade;
drop table if exists public.services cascade;
drop table if exists public.barbers cascade;
drop table if exists public.clients cascade;

-- 3. Habilitação de extensões requeridas pelo Supabase / PostgreSQL
create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- 4. Função utilitária global para atualização automática de updated_at
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = now();
    return new;
end;
$$;
