# JM Barberclub — Chatbot de Agendamento

Aplicação Next.js mobile-first, desenvolvida somente com JavaScript/JSX. O chatbot registra agendamentos reais no Supabase, mostra os horários já ocupados e protege no banco os serviços exclusivos do William.

## Configuração

1. Como o seu banco já possui as tabelas, não execute `supabase/schema.sql`.
2. Copie `.env.example` como `.env.local` e preencha a URL e a Anon Key do projeto.
3. A integração usa: `services`, `barbers`, `barber_services`, `clients` e `appointments`.
4. Instale e execute:

```bash
npm install
npm run dev
```

Abra `http://localhost:3000`.

Antes de usar agendamentos, execute também `supabase/chatbot-rpc.sql` no SQL Editor. Ele cria as funções seguras necessárias para o chatbot consultar horários e inserir agendamentos sem violar as políticas RLS.

## Personalização rápida

- Serviços, preços, durações e imagens: `lib/data.js`.
- Barbeiros e imagens de perfil: `lib/data.js`. Preencha `image` com uma URL; enquanto estiver vazia, é exibido um placeholder visual.
- Horários de funcionamento: `lib/data.js`.

As durações dos serviços começam em `0`, conforme solicitado, e podem ser ajustadas diretamente no mesmo arquivo.

### Campos esperados no banco existente

`services`: `id`, `name`, `price`, `duration_minutes`, `image_url` · `barbers`: `id`, `name`, `role`, `image_url` · `barber_services`: `barber_id`, `service_id` · `clients`: `id`, `name`, `phone` (único) · `appointments`: `client_id`, `barber_id`, `service_id`, `appointment_date`, `appointment_time`, `status`.

Se algum nome de coluna for diferente, ajuste apenas `lib/appointments.js`.
