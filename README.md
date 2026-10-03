# JM Barberclub — Chatbot de agendamento (v2 refatorado)

Next.js 14 (App Router) + Supabase + Tailwind. PWA.

## Rodando

```bash
cp .env.example .env     # preencha as chaves do Supabase
npm install
npm run dev              # http://localhost:3000
npm test                 # 44 testes da lógica do chat (Node, sem dependências extras)
```

Sem as variáveis do Supabase o chat abre em **modo demonstração** (catálogo local), mas
agendar/consultar exige o banco.

## Arquitetura

```
core/                       ← LÓGICA PURA. Sem React, sem Supabase, sem relógio global.
  domain/                     regras de negócio
    config.js                   horários, serviços de contingência, status — ÚNICO lugar para ajustar
    time.js                     datas na timezone da barbearia (nunca no fuso do celular)
    availability.js             grade de horários, passado, ocupado, duração que estoura o expediente
    eligibility.js              quem faz qual serviço, duração e preço
    appointmentGroups.js        várias linhas do banco → 1 reserva
    phone.js                    normalização/validação de telefone BR
  conversation/               a conversa
    machine.js                  MÁQUINA DE ESTADOS: reduce(ctx, action) → { ctx, effects }
    states.js                   estados e escopos
    intents.js                  comandos globais (menu, voltar, remarcar, preços…)
    parsers.js                  nome, telefone, serviço, barbeiro, data, horário em texto livre
    messages.js                 todos os textos do bot (tom de voz num só lugar)
    quickReplies.js             botões derivados do estado
    selectors.js                derivações para a UI
  __tests__/                  44 testes (domínio, parsers, fluxos completos)

services/                   ← I/O. Único lugar que conhece o Supabase.
  supabase/browser.js         cliente singleton
  repositories/               catalogRepository, appointmentsRepository (só RPCs)
  effects.js                  executa os "effects" da máquina e devolve o resultado como action
  errors.js                   erros com mensagem segura para o cliente
  clientStorage.js, notifyAdmin.js

hooks/useChatbot.js         ← liga a máquina ao React (ctxRef + efeitos fora do reducer)
components/chat/            ← UI burra: ChatbotShell, MessageList, Composer, QuickReplies, widgets/
app/api/notify-admin/       ← rota fina; server/ tem rate limit e a ponte com o painel
supabase/migrations/011_…   ← RPCs novas: listar / cancelar / remarcar
```

### Como a máquina evita "se perder"

1. **Tudo é uma action.** Texto digitado e toque em botão passam pelo mesmo funil.
2. **Actions são validadas contra o estado.** Clique em card antigo ou resposta de rede atrasada é ignorada
   (widgets interativos só existem na última mensagem; disponibilidade usa chave `barbeiro|data`).
3. **Comandos globais em qualquer estado:** `menu`, `voltar`, `cancelar` (desiste do fluxo), `meus agendamentos`,
   `remarcar`, `preços`, `horário de funcionamento`, `ajuda`, `trocar meu telefone`. Perguntas informativas no meio do
   fluxo respondem e **retomam o passo**.
4. **Fallback progressivo:** dica → dica + opções reaparecem → contato humano (WhatsApp). O estado nunca muda por texto não entendido.
5. **`WORKING` barra novas entradas** durante a gravação: sem agendamento duplicado por duplo clique.
6. **Revalidação ao confirmar:** se o cliente deixou o resumo aberto e o horário passou/foi ocupado, volta ao passo certo.
7. **Frases compostas:** "amanhã às 10h", "degradê e limpeza de pele", "tanto faz", "sexta".

### Fluxos cobertos

Boas-vindas · catálogo e preços · funcionamento · cadastro (nome/WhatsApp, só uma vez) · serviços (múltiplos) ·
barbeiro (elegibilidade por serviço, auto-seleção quando só um faz) · data · horário (ocupado, passado, duração,
dia lotado, sugestões próximas) · resumo editável · gravação com conflito/idempotência ·
**consultar · remarcar · cancelar** · fallback · voltar/menu a qualquer momento.

## ⚠️ Antes de ir para produção

1. **Rode `supabase/migrations/011_…sql` primeiro em um branch/projeto de teste.** Foi escrito sem acesso ao seu schema
   (só ao README). Confira os pontos marcados `VERIFIQUE`: nomes de colunas, valores de `status`
   (`cancelado`?), coluna separada de hora, e o **índice único** — se não for parcial
   (`where status in ('pendente','confirmado')`), horários cancelados continuam bloqueados.
2. **Segurança:** o "login" do cliente é o telefone. Quem souber o número vê/cancela/remarca os horários da pessoa.
   Com as RPCs você já pode **fechar o SELECT anônimo** em `appointments` (o chat não lê mais a tabela direto).
   Caminho correto a longo prazo: OTP por WhatsApp/SMS.
3. **Telefone agora é gravado só com dígitos** (antes ia como digitado). Confirme que o painel exibe bem; a RPC de
   listagem aceita qualquer formato já gravado.
4. **Painel:** avisos push só existem para *novo agendamento*. Remarcar/cancelar não notificam o barbeiro ainda
   (precisa de endpoint novo no painel).
5. **Duração:** hoje todos os serviços têm `default_duration_minutes = 0`, então cada agendamento ocupa 1 faixa de 30 min.
   O código já respeita duração real (e `custom_duration_minutes` por barbeiro) assim que você preencher.
   `chatbot_booked_times` devolve só horários de **início**; para bloquear faixas de serviços longos ela precisa expandir a duração.
6. **Rotacione o `PUSH_WEBHOOK_SECRET`:** o `.env` real estava dentro do zip enviado. Ele **não** foi incluído aqui.

## O que mudou em relação à v1 (bugs corrigidos)

- Horário de **hoje** que já passou podia ser agendado; "hoje" usava o relógio do celular → agora timezone da barbearia.
- Consulta de agendamentos montava filtro PostgREST com texto do usuário (`.or(\`client_phone.eq.${…}\`)`) → injeção de filtro; agora RPC.
- Não havia como cancelar/remarcar; só listar (e histórico inteiro, com `select *`).
- Confirmação esperava até 12 s pelo aviso ao painel → agora em segundo plano.
- `lib/push.js` importava a si mesmo (circular) e não era usado → removido; `lib/supabase/server.js` também (sem uso).
- Rate limit em memória nunca limpava o `Map` → corrigido.
- Erros do banco apareciam crus para o cliente → mensagens seguras; detalhe só no console.
- Typo "Assistente Vitual".
