/**
 * A RPC de criação grava UMA linha por serviço. Para o cliente, isso é UMA reserva.
 * Este módulo junta as linhas em grupos para consulta, remarcação e cancelamento.
 *
 * Critério (do mais confiável ao menos):
 *  1. `batchKey` (created_at): linhas inseridas na mesma transação compartilham o
 *     mesmo `now()`, então barbeiro + batchKey identificam a reserva sem ambiguidade.
 *  2. Sem batchKey: linhas do MESMO barbeiro encadeadas (início <= fim da anterior + tolerância).
 *     Com durações 0 isso só agrupa linhas com o mesmo horário de início — por isso o item 1.
 */
import { APPOINTMENT_GROUPING } from "./config.js";
import { fromTimestamp } from "./time.js";

/**
 * @param {Array<{id, barberId, barberName, serviceId, serviceName, startsAt, status, batchKey?}>} rows
 * @param {{ toleranceMinutes?: number, durationOf?: (row) => number }} [options]
 */
export function groupAppointments(rows, { toleranceMinutes = APPOINTMENT_GROUPING.toleranceMinutes, durationOf = () => 0 } = {}) {
  const sorted = [...rows].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt) || String(a.id).localeCompare(String(b.id)));
  const groups = [];

  for (const row of sorted) {
    const start = Date.parse(row.startsAt);
    const end = start + durationOf(row) * 60_000;
    const joinable = (g) =>
      g.barberId === row.barberId &&
      (row.batchKey && g.batchKey ? row.batchKey === g.batchKey : !row.batchKey && !g.batchKey && start <= g.endsAtMs + toleranceMinutes * 60_000);
    const group = groups.find(joinable);

    if (group) {
      group.ids.push(row.id);
      group.serviceIds.push(row.serviceId);
      group.serviceNames.push(row.serviceName);
      group.rowTimes.push(fromTimestamp(row.startsAt).time);
      group.endsAtMs = Math.max(group.endsAtMs, end);
    } else {
      groups.push({
        ids: [row.id],
        serviceIds: [row.serviceId],
        serviceNames: [row.serviceName],
        barberId: row.barberId,
        barberName: row.barberName,
        startsAt: row.startsAt,
        status: row.status,
        batchKey: row.batchKey ?? null,
        endsAtMs: end,
        rowTimes: [fromTimestamp(row.startsAt).time],
        ...fromTimestamp(row.startsAt), // dateKey + time na timezone da barbearia
      });
    }
  }
  return groups.map((group) => ({ ...group, key: group.ids.join(",") }));
}
