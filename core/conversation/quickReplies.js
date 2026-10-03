/**
 * Botões de resposta rápida (chips) — DERIVADOS do estado atual, nunca guardados.
 * Como dependem só do contexto, é impossível o usuário ficar com um botão "velho".
 *
 * chip = { label, action, bubble? }
 *   bubble: texto que aparece como fala do usuário ("" = nenhum; omitido = usa o label)
 */
import { S } from "./states.js";
import { getEligibleBarbers } from "../domain/eligibility.js";
import { addDays, todayKey } from "../domain/time.js";

const chip = (label, action, bubble) => (bubble === undefined ? { label, action } : { label, action, bubble });

const MENU = chip("🏠 Menu", { type: "GO_MENU" });
const BACK = chip("← Voltar", { type: "GO_BACK" });
const NEW_BOOKING = chip("📅 Novo agendamento", { type: "START_BOOKING" });
const MY_APPOINTMENTS = chip("🗓️ Meus agendamentos", { type: "VIEW_APPOINTMENTS", mode: "view" });

export function quickRepliesFor(c) {
  const base = baseChips(c);
  return [...(c.suggest ?? []), ...base];
}

function baseChips(c) {
  switch (c.state) {
    case S.MENU:
      return [
        chip("📅 Agendar horário", { type: "START_BOOKING" }),
        MY_APPOINTMENTS,
        chip("💈 Serviços e preços", { type: "VIEW_CATALOG" }),
        chip("🕒 Funcionamento", { type: "VIEW_HOURS" }),
        c.client.phone ? chip("✏️ Trocar meus dados", { type: "RESET_IDENTITY" }) : null,
      ].filter(Boolean);

    case S.ASK_NAME:
      return [MENU];
    case S.ASK_PHONE:
      return [BACK, MENU];

    case S.CHOOSE_SERVICES: {
      if (c.catalog.status === "error") return [chip("🔄 Tentar novamente", { type: "RETRY_CATALOG" }, ""), MENU];
      const selected = c.draft.services;
      return [
        selected.length ? chip("Continuar ➜", { type: "CONFIRM_SERVICES" }, selected.map((s) => s.name).join(" + ")) : null,
        MENU,
      ].filter(Boolean);
    }

    case S.CHOOSE_BARBER:
      return [
        getEligibleBarbers(c.catalog, c.draft.services).length > 1 ? chip("Tanto faz", { type: "PICK_BARBER", id: "any" }) : null,
        BACK,
        MENU,
      ].filter(Boolean);

    case S.CHOOSE_DATE: {
      const today = todayKey(c.now);
      return [
        chip("Hoje", { type: "PICK_DATE", date: today }),
        chip("Amanhã", { type: "PICK_DATE", date: addDays(today, 1) }),
        BACK,
        MENU,
      ];
    }

    case S.CHOOSE_TIME:
      return [
        c.availability.status === "error" ? chip("🔄 Tentar novamente", { type: "RETRY_AVAILABILITY" }, "") : null,
        chip("📆 Outro dia", { type: "GO_BACK" }),
        MENU,
      ].filter(Boolean);

    case S.CONFIRM: {
      const rescheduling = c.mode === "reschedule";
      return [
        chip(rescheduling ? "✅ Confirmar remarcação" : "✅ Confirmar", { type: "CONFIRM_BOOKING" }),
        ...(rescheduling
          ? []
          : [chip("Trocar serviço", { type: "CHANGE_FIELD", field: "services" }), chip("Trocar barbeiro", { type: "CHANGE_FIELD", field: "barber" })]),
        chip("Trocar dia", { type: "CHANGE_FIELD", field: "date" }),
        chip("Trocar horário", { type: "CHANGE_FIELD", field: "time" }),
        MENU,
      ];
    }

    case S.LIST_APPOINTMENTS:
      if (c.appointments.status === "error") return [chip("🔄 Tentar novamente", { type: "RETRY_LIST" }, ""), MENU];
      return [MENU, NEW_BOOKING];

    case S.CONFIRM_CANCEL:
      return [chip("Sim, cancelar", { type: "CONFIRM_CANCEL_YES" }), chip("Não, manter", { type: "CANCEL_ABORT" })];

    case S.DONE:
      return [NEW_BOOKING, MY_APPOINTMENTS, MENU];

    default:
      return []; // BOOT, WORKING
  }
}
