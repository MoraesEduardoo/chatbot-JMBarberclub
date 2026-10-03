/** Quem faz o quê: elegibilidade de barbeiros, duração e preço. */
import { RESTRICTED_BARBER_NAME } from "./config.js";

const sameName = (a, b) => String(a).trim().toLowerCase() === String(b).trim().toLowerCase();

/**
 * Barbeiros que realizam TODOS os serviços escolhidos.
 * Com vínculos em `barber_services` (catalog.links) eles são a regra;
 * sem vínculos, usamos a marcação `restricted` (só William) como contingência.
 */
export function getEligibleBarbers(catalog, services) {
  if (!services.length) return [];
  return catalog.barbers.filter((barber) =>
    services.every((service) => {
      if (catalog.links.length) {
        return catalog.links.some((l) => l.serviceId === service.id && l.barberId === barber.id);
      }
      return !service.restricted || sameName(barber.name, RESTRICTED_BARBER_NAME);
    }),
  );
}

/** Duração de um serviço: `custom_duration_minutes` do barbeiro tem prioridade sobre o padrão. */
export function getServiceDuration(catalog, service, barberId) {
  const link = catalog.links.find((l) => l.serviceId === service.id && l.barberId === barberId);
  return link?.customDurationMinutes ?? service.durationMinutes ?? 0;
}

export const getTotalDuration = (catalog, services, barberId) =>
  services.reduce((sum, service) => sum + getServiceDuration(catalog, service, barberId), 0);

export const getTotalPrice = (services) => services.reduce((sum, s) => sum + Number(s.price || 0), 0);
