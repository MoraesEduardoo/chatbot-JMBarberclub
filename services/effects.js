/**
 * EXECUTOR DE EFEITOS — a ponte entre a máquina de estados (pura) e o mundo real.
 * Recebe `effect` (descrição do que fazer) e devolve o resultado como uma nova action
 * via `dispatch`. É o único lugar que mistura "o que o bot quer" com "I/O".
 */
import { loadCatalog } from "./repositories/catalogRepository.js";
import {
  cancelAppointments, createAppointments, fetchBookedTimes, listActiveAppointments, rescheduleAppointments,
} from "./repositories/appointmentsRepository.js";
import { notifyAdminPanel } from "./notifyAdmin.js";
import { clearClient, saveClient } from "./clientStorage.js";
import { toAppError } from "./errors.js";

export function createEffectRunner(dispatch) {
  return async function run(effect) {
    try {
      switch (effect.type) {
        case "LOAD_CATALOG":
          return dispatch({ type: "CATALOG_LOADED", catalog: await loadCatalog() });

        case "LOAD_AVAILABILITY":
          return dispatch({
            type: "AVAILABILITY_LOADED",
            key: effect.key,
            booked: await fetchBookedTimes({ barberId: effect.barberId, dateKey: effect.dateKey }),
          });

        case "LOAD_APPOINTMENTS":
          return dispatch({
            type: "APPOINTMENTS_LOADED",
            groups: await listActiveAppointments({ phone: effect.phone, catalog: effect.catalog }),
          });

        case "SAVE_BOOKING": {
          const ids = await createAppointments(effect);
          dispatch({ type: "SAVE_OK", kind: "book" });
          void notifyAdminPanel(ids[0]); // sem await: o cliente não espera o painel
          return undefined;
        }

        case "SAVE_RESCHEDULE":
          await rescheduleAppointments({ ids: effect.target.ids, phone: effect.client.phone, dateKey: effect.dateKey, time: effect.time });
          return dispatch({ type: "SAVE_OK", kind: "reschedule" });

        case "CANCEL":
          await cancelAppointments({ ids: effect.ids, phone: effect.phone });
          return dispatch({ type: "CANCEL_OK" });

        case "PERSIST_CLIENT":
          return saveClient(effect.client);
        case "CLEAR_CLIENT":
          return clearClient();

        default:
          return undefined;
      }
    } catch (raw) {
      const error = toAppError(raw);
      switch (effect.type) {
        case "LOAD_CATALOG": return dispatch({ type: "CATALOG_FAILED" });
        case "LOAD_AVAILABILITY": return dispatch({ type: "AVAILABILITY_FAILED", key: effect.key });
        case "LOAD_APPOINTMENTS": return dispatch({ type: "APPOINTMENTS_FAILED" });
        case "SAVE_BOOKING":
        case "SAVE_RESCHEDULE":
          return error.kind === "conflict" ? dispatch({ type: "SAVE_CONFLICT" }) : dispatch({ type: "SAVE_FAILED", message: error.message });
        case "CANCEL": return dispatch({ type: "CANCEL_FAILED", message: error.message });
        default: return undefined;
      }
    }
  };
}
