-- =============================================================================
-- 003_seed_catalog_defaults.sql
-- =============================================================================
-- Inserção de Dados Iniciais (Seeds) Oficiais da JM Barberclub:
-- - Barbeiros
-- - Tabela Completa de Serviços
-- - Associação de Serviços por Barbeiro (com serviços restritos ao William)
-- - Escalas Semanais de Trabalho dos Barbeiros
-- - Configurações de Negócio do Chatbot
-- =============================================================================

-- 1. Barbeiros
insert into public.barbers (id, name, phone, is_active)
values
  ('b949db29-efb1-4131-8234-873195068328', 'Matheus', '5583999990001', true),
  ('9ebcd15c-b747-4d0b-b12f-5de9465363f9', 'William', '5583999990002', true)
on conflict (id) do update set
  name = excluded.name,
  is_active = excluded.is_active;

-- 2. Tabela Oficial de Serviços da Barbearia
-- (UUIDs determinísticos baseados em namespace para idempotência)
insert into public.services (id, name, description, price, default_duration_minutes, is_active)
values
  ('11111111-0000-0000-0000-000000000001', 'Degradê', 'Corte degradê moderno com acabamento impecável', 25.00, 30, true),
  ('11111111-0000-0000-0000-000000000002', 'Corte Só Tesoura', 'Corte clássico ou contemporâneo executado 100% na tesoura', 25.00, 30, true),
  ('11111111-0000-0000-0000-000000000003', 'Lowfade ou Americano', 'Degradê baixo ou americano estilizado', 25.00, 30, true),
  ('11111111-0000-0000-0000-000000000004', 'Barboterapia', 'Tratamento relaxante com toalha quente, óleos e navalha', 20.00, 30, true),
  ('11111111-0000-0000-0000-000000000005', 'Corte e Barboterapia', 'Combo completo com corte estilizado e barboterapia', 40.00, 60, true),
  ('11111111-0000-0000-0000-000000000006', 'Corte + Barba Simples', 'Corte completo com alinhamento e design de barba', 35.00, 50, true),
  ('11111111-0000-0000-0000-000000000007', 'Barba (Cavanhaque ou Design Simples)', 'Alinhamento e contorno de barba ou cavanhaque', 15.00, 20, true),
  ('11111111-0000-0000-0000-000000000008', 'Degradê + Sobrancelha', 'Corte degradê com design de sobrancelha', 30.00, 40, true),
  ('11111111-0000-0000-0000-000000000009', 'Social + Sobrancelha', 'Corte tradicional alinhado com design de sobrancelha', 25.00, 35, true),
  ('11111111-0000-0000-0000-000000000010', 'Corte Simples ou Social', 'Corte tradicional social rápido e elegante', 20.00, 30, true),
  ('11111111-0000-0000-0000-000000000011', 'Limpeza de Pele', 'Higienização facial profunda e esfoliação', 15.00, 30, true),
  ('11111111-0000-0000-0000-000000000012', 'Sobrancelha na linha', 'Design egípcio na linha (Exclusivo William)', 15.00, 15, true),
  ('11111111-0000-0000-0000-000000000013', 'Corte Freestyle', 'Desenhos e artes livres personalizadas no cabelo (Exclusivo William)', 15.00, 30, true)
on conflict (id) do update set
  name = excluded.name,
  description = excluded.description,
  price = excluded.price,
  default_duration_minutes = excluded.default_duration_minutes,
  is_active = excluded.is_active;

-- 3. Associação Barbeiro <-> Serviços (barber_services)
-- William realiza todos os 13 procedimentos (incluindo Sobrancelha na linha e Freestyle)
insert into public.barber_services (barber_id, service_id, custom_duration_minutes, custom_price)
select
  '9ebcd15c-b747-4d0b-b12f-5de9465363f9' as barber_id,
  id as service_id,
  default_duration_minutes,
  price
from public.services
on conflict (barber_id, service_id) do nothing;

-- Matheus realiza todos os serviços, exceto os restritos (Sobrancelha na linha e Freestyle)
insert into public.barber_services (barber_id, service_id, custom_duration_minutes, custom_price)
select
  'b949db29-efb1-4131-8234-873195068328' as barber_id,
  id as service_id,
  default_duration_minutes,
  price
from public.services
where name not in ('Sobrancelha na linha', 'Corte Freestyle')
on conflict (barber_id, service_id) do nothing;

-- 4. Escalas Semanais Padrão dos Barbeiros (0=Domingo a 6=Sábado)
-- Matheus
insert into public.barber_schedules (barber_id, day_of_week, is_working, start_time, end_time, lunch_start, lunch_end)
values
  ('b949db29-efb1-4131-8234-873195068328', 0, true, '09:00', '12:30', null, null),
  ('b949db29-efb1-4131-8234-873195068328', 1, true, '14:30', '19:00', null, null),
  ('b949db29-efb1-4131-8234-873195068328', 2, true, '09:00', '19:00', '12:00', '13:00'),
  ('b949db29-efb1-4131-8234-873195068328', 3, true, '09:00', '19:00', '12:00', '13:00'),
  ('b949db29-efb1-4131-8234-873195068328', 4, true, '09:00', '19:00', '12:00', '13:00'),
  ('b949db29-efb1-4131-8234-873195068328', 5, true, '09:00', '19:00', '12:00', '13:00'),
  ('b949db29-efb1-4131-8234-873195068328', 6, true, '09:00', '19:00', '12:00', '13:00')
on conflict (barber_id, day_of_week) do update set
  is_working = excluded.is_working,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  lunch_start = excluded.lunch_start,
  lunch_end = excluded.lunch_end;

-- William
insert into public.barber_schedules (barber_id, day_of_week, is_working, start_time, end_time, lunch_start, lunch_end)
values
  ('9ebcd15c-b747-4d0b-b12f-5de9465363f9', 0, true, '09:00', '12:30', null, null),
  ('9ebcd15c-b747-4d0b-b12f-5de9465363f9', 1, true, '14:30', '19:00', null, null),
  ('9ebcd15c-b747-4d0b-b12f-5de9465363f9', 2, true, '09:00', '19:00', '12:00', '13:00'),
  ('9ebcd15c-b747-4d0b-b12f-5de9465363f9', 3, true, '09:00', '19:00', '12:00', '13:00'),
  ('9ebcd15c-b747-4d0b-b12f-5de9465363f9', 4, true, '09:00', '19:00', '12:00', '13:00'),
  ('9ebcd15c-b747-4d0b-b12f-5de9465363f9', 5, true, '09:00', '19:00', '12:00', '13:00'),
  ('9ebcd15c-b747-4d0b-b12f-5de9465363f9', 6, true, '09:00', '19:00', '12:00', '13:00')
on conflict (barber_id, day_of_week) do update set
  is_working = excluded.is_working,
  start_time = excluded.start_time,
  end_time = excluded.end_time,
  lunch_start = excluded.lunch_start,
  lunch_end = excluded.lunch_end;

-- 5. Configurações Globais do Negócio
insert into public.business_settings (key, value, description)
values
  ('min_lead_minutes', '30', 'Antecedência mínima permitida para agendar no mesmo dia (minutos)'),
  ('max_future_days', '30', 'Janela máxima permitida para agendamentos futuros (dias)'),
  ('cleaning_buffer_minutes', '10', 'Intervalo técnico / respiro de limpeza pós-atendimento (minutos)'),
  ('free_cancellation', 'true', 'Cancelamento totalmente livre e autônomo sem bloqueio por prazo'),
  ('slot_granularity_minutes', '30', 'Granularidade padrão de início da grade de horários'),
  ('shop_timezone', 'America/Fortaleza', 'Fuso horário padrão da barbearia')
on conflict (key) do update set
  value = excluded.value,
  description = excluded.description;
