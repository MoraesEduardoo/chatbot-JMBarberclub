/**
 * Rate limit simples em memória, por IP. Suficiente para frear abuso casual.
 * Em serverless (Vercel) cada instância tem a sua própria memória — para um limite
 * global use Upstash/Redis ou o Vercel Firewall.
 */
export function createRateLimiter({ windowMs = 60_000, max = 15 } = {}) {
  const hits = new Map(); // ip → { count, startedAt }

  return function isLimited(ip, now = Date.now()) {
    // Limpeza oportunista: sem isto o Map cresceria para sempre (um IP novo por requisição).
    if (hits.size > 5_000) {
      for (const [key, entry] of hits) if (now - entry.startedAt > windowMs) hits.delete(key);
    }
    const entry = hits.get(ip);
    if (!entry || now - entry.startedAt > windowMs) {
      hits.set(ip, { count: 1, startedAt: now });
      return false;
    }
    entry.count += 1;
    return entry.count > max;
  };
}
