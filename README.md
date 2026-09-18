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

---

## Integração com o painel do barbeiro

O chat e o painel (`jm-barberclub-admin-v3`) usam **a mesma base Supabase**
(projeto `buwyemmvitoygnekbqdu`) — `NEXT_PUBLIC_SUPABASE_URL` e
`NEXT_PUBLIC_SUPABASE_ANON_KEY` são idênticos nos dois `.env`. Verificado.

### O caminho de um agendamento feito no chat

1. `saveAppointment()` (`lib/appointments.js`) chama a RPC
   `chatbot_create_appointments`, que insere uma linha em `appointments`
   por serviço escolhido, com `status = 'pendente'` e `is_walk_in = false`.
2. A função confere os ids devolvidos e relê as linhas no banco. Se nada
   foi gravado, o chat **falha com mensagem clara** em vez de mostrar
   "Agendamento confirmado" sem registro nenhum.
3. `POST /api/notify-admin` repassa o id do agendamento para o painel
   (`/api/push/appointment-created`), que dispara o push "Novo agendamento!"
   no telemóvel do barbeiro e do chefe.
4. Em paralelo, o painel aberto recebe o INSERT pelo Supabase Realtime e
   mostra o toast/sino na hora.

### Para funcionar

1. Rodar `supabase/migrations/010_chatbot_create_appointments.sql` no SQL
   Editor do Supabase. **Este é o passo obrigatório**: a migração 003 do
   painel ligou o RLS em `appointments` deixando só SELECT liberado, então
   a escrita do chat precisa da função `SECURITY DEFINER` definida ali.
2. Preencher `ADMIN_PANEL_URL` e `PUSH_WEBHOOK_SECRET` no `.env` do chat
   (e nas variáveis de ambiente da Vercel). O segredo tem que ser igual ao
   do painel.
3. No painel, a migração `005_push_subscriptions.sql` precisa estar
   aplicada e o barbeiro precisa ter ativado o botão de notificações no
   Perfil, senão não existe destinatário para o push.

O chat trata tanto o código PostgreSQL `23505` quanto a resposta HTTP `409`.
Se a primeira tentativa já tiver gravado a reserva e apenas a resposta se
perdeu, ele localiza o mesmo agendamento, mostra a confirmação normalmente e
tenta avisar o painel outra vez — sem criar uma segunda reserva.

Não aplique também o gatilho opcional `006_push_trigger_novo_agendamento.sql`
do painel: com `/api/notify-admin` já chamando a rota, o disparo sairia
duplicado.
