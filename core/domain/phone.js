/** Telefone brasileiro: sempre armazenado/consultado só com dígitos (DDD + número, sem +55). */

export function normalizePhone(input) {
  let digits = String(input ?? "").replace(/\D/g, "");
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) digits = digits.slice(2);
  return digits;
}

export function isValidPhone(input) {
  const digits = normalizePhone(input);
  if (!/^\d{10,11}$/.test(digits)) return false;
  if (Number(digits.slice(0, 2)) < 11) return false; // DDD inexistente
  if (digits.length === 11 && digits[2] !== "9") return false; // celular começa com 9
  return true;
}

export function formatPhone(input) {
  const d = normalizePhone(input);
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return String(input ?? "");
}
