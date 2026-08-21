# 💈 JM Barberclub — Chatbot de Agendamento

## 📖 Introdução
O **JM Barberclub** é uma aplicação web moderna com foco em dispositivos móveis (*mobile-first*), desenvolvida para otimizar e automatizar a experiência de agendamento em barbearias. A plataforma conta com um assistente inteligente em formato de chatbot, permitindo que os clientes marquem horários, consultem a disponibilidade em tempo real e interajam com os serviços de forma ágil e intuitiva. 

O sistema foi arquitetado para garantir uma gestão eficiente de horários, controle de profissionais e segurança nos dados, integrando-se diretamente com um banco de dados relacional robusto.

---

## 🚀 Ferramentas e Tecnologias Utilizadas

O projeto foi construído utilizando um conjunto moderno de tecnologias voltadas para performance e escalabilidade:

* **Frontend & Lógica:** 
  * **Next.js** (Framework React com foco em experiência mobile-first)
  * **JavaScript (JSX)** para estruturação dos componentes e interatividade do chat.
  * **Tailwind CSS** (ou estilização moderna) para o design responsivo.
* **Backend & Banco de Dados:**
  * **Supabase** (Plataforma Backend-as-a-Service baseada em PostgreSQL).
  * **Funções RPC do PostgreSQL** para regras de negócio seguras e consultas customizadas de horários.
* **Hospedagem & Deploy:**
  * **Vercel** para distribuição contínua e alta disponibilidade em produção.

---

## 🛠️ Arquitetura e Integração

A aplicação se conecta a um ecossistema de dados estruturado nas seguintes tabelas do Supabase:
* **`services`**: Catálogo de serviços oferecidos, preços e durações.
* **`barbers`**: Perfil dos profissionais da barbearia.
* **`barber_services`**: Relacionamento e personalização de serviços por profissional.
* **`clients`**: Base de clientes cadastrados no sistema.
* **`appointments`**: Registro central de agendamentos e status de atendimento.
