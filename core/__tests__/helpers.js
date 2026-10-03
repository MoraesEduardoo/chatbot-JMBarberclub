import { createInitialContext, reduce } from "../conversation/machine.js";
import { FALLBACK_BARBERS, FALLBACK_SERVICES } from "../domain/config.js";

// Segunda-feira, 05/10/2026, 10:00 em Campina Grande (-03:00). Segunda abre só às 14:30.
export const NOW = Date.parse("2026-10-05T10:00:00-03:00");

export const CATALOG = {
  services: FALLBACK_SERVICES.map((s) => ({ ...s, durationMinutes: 30 })),
  barbers: FALLBACK_BARBERS.map((b) => ({ ...b })),
  links: [],
};

/**
 * Mini-runtime de teste: aplica actions, executa efeitos contra um backend falso e
 * devolve o contexto final. `backend` pode sobrescrever respostas (para simular falhas).
 */
export function createSession({ client = { name: "", phone: "" }, backend = {}, now = NOW } = {}) {
  const log = { effects: [] };
  const be = {
    booked: [],
    appointments: [],
    saveBooking: () => ({ kind: "ok" }),
    saveReschedule: () => ({ kind: "ok" }),
    cancel: () => ({ kind: "ok" }),
    ...backend,
  };
  let ctx = createInitialContext(now);

  const send = (action) => {
    const { ctx: next, effects } = reduce(ctx, { now, ...action });
    ctx = next;
    for (const fx of effects) {
      log.effects.push(fx);
      const result = runEffect(fx, be, ctx);
      if (result) send(result);
    }
    return ctx;
  };
  send({ type: "BOOT_DONE", client });
  return {
    send,
    text: (t) => send({ type: "TEXT", text: t }),
    get ctx() { return ctx; },
    log,
    last: () => [...ctx.messages].reverse().find((m) => m.from === "bot" && m.text)?.text ?? "",
    texts: () => ctx.messages.filter((m) => m.from === "bot" && m.text).map((m) => m.text),
  };
}

function runEffect(fx, be, ctx) {
  switch (fx.type) {
    case "LOAD_CATALOG": return { type: "CATALOG_LOADED", catalog: CATALOG };
    case "LOAD_AVAILABILITY": return { type: "AVAILABILITY_LOADED", key: fx.key, booked: typeof be.booked === "function" ? be.booked(fx) : be.booked };
    case "LOAD_APPOINTMENTS": return { type: "APPOINTMENTS_LOADED", groups: typeof be.appointments === "function" ? be.appointments(fx) : be.appointments };
    case "SAVE_BOOKING": {
      const r = be.saveBooking(fx);
      if (!r) return null; // backend "pendurado": nunca responde
      return r.kind === "ok" ? { type: "SAVE_OK", kind: "book" } : r.kind === "conflict" ? { type: "SAVE_CONFLICT" } : { type: "SAVE_FAILED", message: r.message ?? "erro" };
    }
    case "SAVE_RESCHEDULE": {
      const r = be.saveReschedule(fx);
      return r.kind === "ok" ? { type: "SAVE_OK", kind: "reschedule" } : r.kind === "conflict" ? { type: "SAVE_CONFLICT" } : { type: "SAVE_FAILED", message: r.message ?? "erro" };
    }
    case "CANCEL": {
      const r = be.cancel(fx);
      return r.kind === "ok" ? { type: "CANCEL_OK" } : { type: "CANCEL_FAILED", message: r.message ?? "erro" };
    }
    default: return null; // PERSIST_CLIENT, CLEAR_CLIENT
  }
}

export const group = (over = {}) => ({
  key: "a1,a2", ids: ["a1", "a2"], serviceIds: ["degrade", "barba"], serviceNames: ["Degradê", "Barba (Cavanhaque ou Design Simples)"],
  barberId: CATALOG.barbers[0].id, barberName: "Matheus", startsAt: "2026-10-07T15:00:00-03:00", status: "pendente",
  dateKey: "2026-10-07", time: "15:00", rowTimes: ["15:00", "15:30"], batchKey: null, endsAtMs: 0, ...over,
});
