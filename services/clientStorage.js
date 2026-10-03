/** Persistência local do cliente (nome/WhatsApp) — nunca derruba o app se o storage estiver bloqueado. */
const NAME_KEY = "jm_client_name";
const PHONE_KEY = "jm_client_phone";

export function loadClient() {
  try {
    return { name: localStorage.getItem(NAME_KEY) ?? "", phone: localStorage.getItem(PHONE_KEY) ?? "" };
  } catch {
    return { name: "", phone: "" };
  }
}

export function saveClient({ name, phone }) {
  try {
    if (name) localStorage.setItem(NAME_KEY, name);
    if (phone) localStorage.setItem(PHONE_KEY, phone);
  } catch { /* modo privado / storage cheio: segue sem persistir */ }
}

export function clearClient() {
  try {
    localStorage.removeItem(NAME_KEY);
    localStorage.removeItem(PHONE_KEY);
  } catch { /* idem */ }
}
