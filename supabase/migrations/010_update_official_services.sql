-- =============================================================================
-- 010_update_official_services.sql
-- =============================================================================
-- ATUALIZAÇÃO OFICIAL DE SERVIÇOS E VALORES (JM BARBERCLUB)
-- 
-- Substitui completamente os serviços anteriores pelo catálogo oficial de 11 itens
-- extraído da tabela oficial da barbearia, com valores convertidos em centavos,
-- durações precisas e ordem de exibição correspondente.
--
-- Vincula automaticamente todos os 11 serviços para ambos os profissionais
-- (Matheus e William) nas tabelas relacionais de serviços do barbeiro.
-- Sem injeção de imagens automáticas (gestão visual via haircut_gallery).
-- =============================================================================

begin;

-- 1. Inserir ou atualizar os 11 serviços oficiais com IDs canônicos
insert into public.services (
    id,
    name,
    description,
    price,
    duration_minutes,
    is_active,
    display_order,
    category,
    created_at,
    updated_at
)
values
    (
        'a0000000-0000-0000-0000-000000000001',
        'Degradê',
        'Corte degradê moderno com acabamento refinado e transição suave.',
        2500,
        30,
        true,
        1,
        'Cortes',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000002',
        'Corte SÓ Tesoura',
        'Corte tradicional executado 100% na tesoura com alinhamento e precisão.',
        2500,
        40,
        true,
        2,
        'Cortes',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000003',
        'Lowfade ou Americano',
        'Degradê baixo e estiloso no modelo Low Fade ou Americano.',
        2500,
        30,
        true,
        3,
        'Cortes',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000004',
        'Barboterapia',
        'Tratamento relaxante com toalha quente, esfoliação e hidratação profunda.',
        2000,
        30,
        true,
        4,
        'Barba',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000005',
        'Corte e Barboterapia',
        'Combo premium completo: corte alinhado e barboterapia relaxante.',
        4000,
        60,
        true,
        5,
        'Combos',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000006',
        'Corte + Barba Simples',
        'Combo prático: corte alinhado com aparo e contorno de barba simples.',
        3500,
        50,
        true,
        6,
        'Combos',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000007',
        'Barba (Cavanhaque ou Design Simples)',
        'Aparo e contorno de barba, cavanhaque ou desenho simples com navalhete.',
        1500,
        20,
        true,
        7,
        'Barba',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000008',
        'Degradê + Sobrancelha',
        'Corte degradê de alta precisão com design e limpeza de sobrancelha.',
        3000,
        40,
        true,
        8,
        'Combos',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000009',
        'Social + Sobrancelha',
        'Corte social clássico acompanhado de design e limpeza de sobrancelha.',
        2500,
        40,
        true,
        9,
        'Combos',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000010',
        'Corte Simples ou Social',
        'Corte simples tradicional na máquina ou tesoura para o dia a dia.',
        2000,
        30,
        true,
        10,
        'Cortes',
        now(),
        now()
    ),
    (
        'a0000000-0000-0000-0000-000000000011',
        'Limpeza de Pele',
        'Procedimento facial revigorante com remoção de impurezas e oleosidade.',
        1500,
        25,
        true,
        11,
        'Estética',
        now(),
        now()
    )
on conflict (id) do update set
    name = excluded.name,
    description = excluded.description,
    price = excluded.price,
    duration_minutes = excluded.duration_minutes,
    is_active = excluded.is_active,
    display_order = excluded.display_order,
    category = excluded.category,
    updated_at = now();

-- 2. Migração segura de integridade referencial:
-- Se houver agendamentos prévios que apontam para serviços fora dos 11 novos itens,
-- redireciona para o serviço 1 (Degradê) para evitar erro de violação de chave estrangeira (FK restrict).
update public.appointments
set service_id = 'a0000000-0000-0000-0000-000000000001'
where service_id not in (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000008',
    'a0000000-0000-0000-0000-000000000009',
    'a0000000-0000-0000-0000-000000000010',
    'a0000000-0000-0000-0000-000000000011'
);

-- Redireciona eventuais registros de fila de espera caso as tabelas existam
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'waitlist') then
        execute 'update public.waitlist set service_id = null where service_id not in (
            ''a0000000-0000-0000-0000-000000000001'',
            ''a0000000-0000-0000-0000-000000000002'',
            ''a0000000-0000-0000-0000-000000000003'',
            ''a0000000-0000-0000-0000-000000000004'',
            ''a0000000-0000-0000-0000-000000000005'',
            ''a0000000-0000-0000-0000-000000000006'',
            ''a0000000-0000-0000-0000-000000000007'',
            ''a0000000-0000-0000-0000-000000000008'',
            ''a0000000-0000-0000-0000-000000000009'',
            ''a0000000-0000-0000-0000-000000000010'',
            ''a0000000-0000-0000-0000-000000000011''
        )';
    end if;

    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'chatbot_waitlist') then
        execute 'update public.chatbot_waitlist set service_id = null where service_id not in (
            ''a0000000-0000-0000-0000-000000000001'',
            ''a0000000-0000-0000-0000-000000000002'',
            ''a0000000-0000-0000-0000-000000000003'',
            ''a0000000-0000-0000-0000-000000000004'',
            ''a0000000-0000-0000-0000-000000000005'',
            ''a0000000-0000-0000-0000-000000000006'',
            ''a0000000-0000-0000-0000-000000000007'',
            ''a0000000-0000-0000-0000-000000000008'',
            ''a0000000-0000-0000-0000-000000000009'',
            ''a0000000-0000-0000-0000-000000000010'',
            ''a0000000-0000-0000-0000-000000000011''
        )';
    end if;
end $$;

-- 3. Limpeza das associações de serviços obsoletos em barber_services
delete from public.barber_services
where service_id not in (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000008',
    'a0000000-0000-0000-0000-000000000009',
    'a0000000-0000-0000-0000-000000000010',
    'a0000000-0000-0000-0000-000000000011'
);

-- 4. Limpeza dos serviços obsoletos (remove tudo que não pertence aos 11 oficiais)
delete from public.services
where id not in (
    'a0000000-0000-0000-0000-000000000001',
    'a0000000-0000-0000-0000-000000000002',
    'a0000000-0000-0000-0000-000000000003',
    'a0000000-0000-0000-0000-000000000004',
    'a0000000-0000-0000-0000-000000000005',
    'a0000000-0000-0000-0000-000000000006',
    'a0000000-0000-0000-0000-000000000007',
    'a0000000-0000-0000-0000-000000000008',
    'a0000000-0000-0000-0000-000000000009',
    'a0000000-0000-0000-0000-000000000010',
    'a0000000-0000-0000-0000-000000000011'
);

-- 5. Vinculação automática em public.barber_services
-- Garante que TODOS os barbeiros ativos (Matheus e William) fiquem 100% habilitados
-- para executar todos os 11 serviços oficiais sem diferenciação de preço.
insert into public.barber_services (barber_id, service_id, is_active)
select b.id, s.id, true
from public.barbers b
cross join public.services s
where s.is_active = true
on conflict (barber_id, service_id) do update set 
    is_active = true;

-- 6. Suporte de compatibilidade caso exista a tabela alternativa barbershop_services
do $$
begin
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'barbershop_services') then
        insert into public.barbershop_services (barber_id, service_id, is_active)
        select b.id, s.id, true
        from public.barbers b
        cross join public.services s
        where s.is_active = true
        on conflict do nothing;
    end if;
end $$;

commit;
