/* Shared helpers for every page */
const SESSION_KEY = "fa_session";
const LOGIN_PAGE = { team: "index.html", admin: "admin.html" };
const POLL_MS = 4000;

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const teamName = (n) => "Team " + String(n).padStart(2, "0");
const byOrder = (a, b) => (a.order || 0) - (b.order || 0) || (a.createdAt || 0) - (b.createdAt || 0);

let toastT;
function toast(t) {
  const el = $("toast");
  el.textContent = t;
  el.classList.add("show");
  clearTimeout(toastT);
  toastT = setTimeout(() => el.classList.remove("show"), 2200);
}
function showNote(t) {
  const el = $("dbNote");
  if (!el) return;
  el.textContent = t;
  el.classList.remove("hidden");
}
function hideNote() { $("dbNote")?.classList.add("hidden"); }

/* Session (stored per browser tab) */
function getSession() {
  try { return JSON.parse(sessionStorage.getItem(SESSION_KEY)); } catch { return null; }
}
function setSession(s) { sessionStorage.setItem(SESSION_KEY, JSON.stringify(s)); }
function clearSession() { sessionStorage.removeItem(SESSION_KEY); }

// Sends the visitor to the right login page unless they are signed in with this role.
function requireRole(role) {
  const s = getSession();
  if (!s || s.role !== role) { location.replace(LOGIN_PAGE[role]); return null; }
  return s;
}
function signOut() {
  const s = getSession();
  clearSession();
  location.replace(LOGIN_PAGE[s?.role] || "index.html");
}

/* API calls. Login requests never send a token. */
async function api(method, path, body) {
  const s = getSession();
  const auth = !!s?.token && path !== "/api/login";
  const headers = {};
  if (body) headers["Content-Type"] = "application/json";
  if (auth) headers.Authorization = "Bearer " + s.token;
  const res = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401 && auth) {
    clearSession();
    location.replace(LOGIN_PAGE[s.role] || "index.html");
    throw new Error("Your session ended. Please sign in again.");
  }
  if (!res.ok) throw new Error(data.error || "Could not save. Please try again.");
  return data;
}

// Runs fn now, then every few seconds.
function startPolling(fn) {
  fn();
  return setInterval(fn, POLL_MS);
}
