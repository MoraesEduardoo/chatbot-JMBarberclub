-- =============================================================================
-- 004_seed_catalog_and_defaults.sql
-- =============================================================================
-- Inserção de dados canônicos: Barbeiros oficiais (Matheus e William),
-- Catálogo de 13 Serviços com durações e preços em centavos, e expediente semanal.
-- =============================================================================

-- 1. Barbeiros Oficiais
insert into public.barbers (id, name, phone, bio, is_active, display_order)
values
    ('11111111-1111-4111-a111-111111111111', 'Matheus', '31999990001', 'Especialista em degradê, corte navalhado e visagismo masculino.', true, 1),
    ('22222222-2222-4222-a222-222222222222', 'William', '31999990002', 'Mestre em barba modelada, tratamentos capilares e cortes clássicos.', true, 2)
on conflict (id) do update set
    name = excluded.name,
    phone = excluded.phone,
    bio = excluded.bio,
    is_active = excluded.is_active,
    display_order = excluded.display_order;

-- 2. Catálogo Oficial de Serviços (13 Serviços do JM Barberclub)
insert into public.services (id, name, description, price, duration_minutes, is_active, display_order, category)
values
    ('a0000000-0000-0000-0000-000000000001', 'Degradê', 'Corte degradê moderno com acabamento refinado na navalha.', 2500, 30, true, 1, 'Cortes'),
    ('a0000000-0000-0000-0000-000000000002', 'Social', 'Corte clássico e elegante, ideal para o dia a dia e trabalho.', 2000, 30, true, 2, 'Cortes'),
    ('a0000000-0000-0000-0000-000000000003', 'Militar / Simples', 'Corte prático e alinhado, realizado em máquina e tesoura.', 1800, 30, true, 3, 'Cortes'),
    ('a0000000-0000-0000-0000-000000000004', 'Barba Completa', 'Barba modelada com toalha quente, navalha e óleo hidratante.', 2000, 30, true, 4, 'Barba'),
    ('a0000000-0000-0000-0000-000000000005', 'Barba Simples', 'Alinhamento rápido e aparo do volume com navalhete.', 1500, 20, true, 5, 'Barba'),
    ('a0000000-0000-0000-0000-000000000006', 'Degradê + Barba', 'Combo completo: corte degradê de precisão e barba alinhada.', 4000, 60, true, 6, 'Combos'),
    ('a0000000-0000-0000-0000-000000000007', 'Social + Barba', 'Combo clássico: corte social sofisticado com barba completa.', 3500, 50, true, 7, 'Combos'),
    ('a0000000-0000-0000-0000-000000000008', 'Pézinho / Acabamento', 'Delineamento e contorno preciso do corte na navalha.', 1000, 15, true, 8, 'Acabamento'),
    ('a0000000-0000-0000-0000-000000000009', 'Sobrancelha', 'Design e limpeza com navalhete para valorizar a expressão.', 800, 15, true, 9, 'Estética'),
    ('a0000000-0000-0000-0000-000000000010', 'Lavagem Especial', 'Lavagem com massagem capilar e produtos selecionados.', 1000, 15, true, 10, 'Tratamentos'),
    ('a0000000-0000-0000-0000-000000000011', 'Hidratação Capilar', 'Tratamento intensivo de recuperação do brilho e maciez dos fios.', 2000, 30, true, 11, 'Tratamentos'),
    ('a0000000-0000-0000-0000-000000000012', 'Pigmentação de Barba', 'Correção e preenchimento visual de falhas com tintura especial.', 1500, 25, true, 12, 'Barba'),
    ('a0000000-0000-0000-0000-000000000013', 'Corte Infantil', 'Atendimento paciente e cuidadoso para crianças até 10 anos.', 2500, 35, true, 13, 'Cortes')
on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    duration_minutes = excluded.duration_minutes,
    is_active = excluded.is_active,
    display_order = excluded.display_order,
    category = excluded.category;

-- 3. Habilitação de Todos os Serviços para Ambos os Barbeiros
insert into public.barber_services (barber_id, service_id, is_active)
select b.id, s.id, true
from public.barbers b
cross join public.services s
on conflict (barber_id, service_id) do update set is_active = true;

-- 4. Expediente Semanal Padrão (Segunda a Sábado, 09:00 às 19:00, almoço 12:00 às 13:00)
insert into public.barber_schedules (barber_id, day_of_week, start_time, end_time, break_start_time, break_end_time, is_working_day)
select
    b.id,
    d.day,
    '09:00:00'::time,
    '19:00:00'::time,
    '12:00:00'::time,
    '13:00:00'::time,
    case when d.day = 0 then false else true end
from public.barbers b
cross join (values (0), (1), (2), (3), (4), (5), (6)) as d(day)
on conflict (barber_id, day_of_week) do update set
    start_time = excluded.start_time,
    end_time = excluded.end_time,
    break_start_time = excluded.break_start_time,
    break_end_time = excluded.break_end_time,
    is_working_day = excluded.is_working_day;

-- 5. Exemplos na Galeria de Cortes
insert into public.haircut_gallery (id, title, category, image_url, description, barber_id, is_active, display_order)
values
    ('c0000000-0000-0000-0000-000000000001', 'Mid Fade com Textura', 'Degradê', 'https://images.unsplash.com/photo-1503951914875-452162b0f3f1?auto=format&fit=crop&w=600&q=80', 'Degradê médio harmônico com topo texturizado.', '11111111-1111-4111-a111-111111111111', true, 1),
    ('c0000000-0000-0000-0000-000000000002', 'Barba Lenhador Alinhada', 'Barba', 'https://images.unsplash.com/photo-1621605815971-fbc98d665033?auto=format&fit=crop&w=600&q=80', 'Contorno perfeito nas maçãs do rosto e pescoço.', '22222222-2222-4222-a222-222222222222', true, 2),
    ('c0000000-0000-0000-0000-000000000003', 'Social Executivo', 'Social', 'https://images.unsplash.com/photo-1517832606589-7629c339590a?auto=format&fit=crop&w=600&q=80', 'Corte clássico para ambientes formais e cotidianos.', '11111111-1111-4111-a111-111111111111', true, 3)
on conflict (id) do nothing;
