/**
 * Módulo de autenticación.
 *
 * Guarda la "clave de acceso" en localStorage (fine-grained PAT de GitHub
 * limitado al repositorio del mapa). Valida contra la API que la clave
 * siga siendo válida y expone el usuario conectado.
 *
 * Diseño intencional: la palabra "token" NO aparece en la interfaz.
 * Internamente se llama key porque es correcto; hacia el usuario es
 * "clave de acceso".
 */

import { CONFIG, paths } from './config.js';

const listeners = new Set();

/** Estado de sesión actual (en memoria). */
export const session = {
  status: 'checking',   // 'checking' | 'readonly' | 'connected' | 'expired'
  user:   null,         // { login, name, avatarUrl }
  repo:   `${CONFIG.repo.owner}/${CONFIG.repo.name}`,
  checkedAt: null
};

/**
 * Suscripción a cambios de sesión. Cada módulo (topbar, sidebar, hub…)
 * puede refrescarse cuando el estado cambia sin depender de globales.
 */
export function onSessionChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
function emit() {
  for (const fn of listeners) { try { fn(session); } catch (e) { console.error(e); } }
}

/** ¿Está el usuario habilitado para editar? */
export function canEdit() { return session.status === 'connected'; }

/** ── Manejo de la clave ─────────────────────────────────── */
function getStoredKey() {
  try { return localStorage.getItem(CONFIG.storage.key) || null; }
  catch { return null; }
}
function setStoredKey(k) {
  try { localStorage.setItem(CONFIG.storage.key, k); } catch {}
}
function clearStoredKey() {
  try { localStorage.removeItem(CONFIG.storage.key); } catch {}
}

/**
 * Devuelve la clave para adjuntar en pedidos autenticados.
 * `null` si el panel está en modo lectura.
 */
export function getAuthHeader() {
  const k = getStoredKey();
  return k ? { Authorization: `Bearer ${k}` } : null;
}

/**
 * Verifica la clave contra GitHub:
 *  1) /user — confirma que la clave existe y es válida.
 *  2) /repos/{owner}/{name} — confirma que la clave puede ver el repo.
 * Cualquier fallo => estado 'expired' (con la clave conservada para
 * mostrar mensaje amigable; el usuario decide si reconectar).
 */
export async function checkSession() {
  const key = getStoredKey();

  if (!key) {
    Object.assign(session, { status: 'readonly', user: null, checkedAt: new Date().toISOString() });
    emit();
    return session;
  }

  try {
    const userRes = await fetch(`${paths.apiRoot}/user`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/vnd.github+json' }
    });
    if (!userRes.ok) throw new Error('user');
    const user = await userRes.json();

    const repoRes = await fetch(
      `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}`,
      { headers: { Authorization: `Bearer ${key}`, Accept: 'application/vnd.github+json' } }
    );
    if (!repoRes.ok) throw new Error('repo');

    Object.assign(session, {
      status: 'connected',
      user: { login: user.login, name: user.name || user.login, avatarUrl: user.avatar_url },
      checkedAt: new Date().toISOString()
    });
  } catch (e) {
    Object.assign(session, {
      status: 'expired',
      user: null,
      checkedAt: new Date().toISOString()
    });
  }
  emit();
  return session;
}

/**
 * Guarda una clave nueva y valida. Devuelve `true` si quedó conectado.
 * Si no valida, no la guarda y devuelve `false`.
 */
export async function connectWithKey(rawKey) {
  const key = (rawKey || '').trim();
  if (!key) return { ok: false, error: 'La clave está vacía.' };

  // Validación mínima de forma: los fine-grained PATs empiezan con "github_pat_".
  // No bloqueamos por si GitHub cambia el prefijo, pero avisamos suavemente en el módulo UI.

  try {
    const res = await fetch(`${paths.apiRoot}/user`, {
      headers: { Authorization: `Bearer ${key}`, Accept: 'application/vnd.github+json' }
    });
    if (res.status === 401) return { ok: false, error: 'La clave no es válida. Revisá que la hayas copiado completa.' };
    if (!res.ok) return { ok: false, error: 'No se pudo verificar la clave. Probá de nuevo en un momento.' };
    const user = await res.json();

    const repoRes = await fetch(
      `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}`,
      { headers: { Authorization: `Bearer ${key}`, Accept: 'application/vnd.github+json' } }
    );
    if (repoRes.status === 404 || repoRes.status === 403) {
      return { ok: false, error: 'La clave es válida pero no tiene permiso sobre el proyecto del mapa. Revisá el paso donde elegiste el repositorio.' };
    }
    if (!repoRes.ok) return { ok: false, error: 'No se pudo verificar el permiso sobre el proyecto. Probá de nuevo.' };

    setStoredKey(key);
    Object.assign(session, {
      status: 'connected',
      user: { login: user.login, name: user.name || user.login, avatarUrl: user.avatar_url },
      checkedAt: new Date().toISOString()
    });
    emit();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: 'No se pudo conectar. Verificá tu conexión a internet.' };
  }
}

/** Cierra sesión: borra la clave y vuelve al modo lectura. */
export function disconnect() {
  clearStoredKey();
  Object.assign(session, { status: 'readonly', user: null, checkedAt: new Date().toISOString() });
  emit();
}
