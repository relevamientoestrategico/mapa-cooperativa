/**
 * Gestión de borradores (cambios sin publicar).
 *
 * Cuando el usuario apreta "Guardar" en un editor, el cambio se persiste
 * al repo como un commit *directo*. Es decir, el archivo del barrio ya
 * queda modificado. Lo que hace este módulo es rastrear cuáles barrios
 * tienen cambios que aún no fueron marcados como publicados.
 *
 * Estado inicial simple: guardamos en localStorage un objeto
 *   { [barrioId]: { pendientes: [ { tipo, ts, mensaje } ] } }
 *
 * Cuando el usuario apreta "Publicar cambios" en el hub del barrio, se
 * limpia esta lista (los cambios ya están vivos en el repo; publicar
 * cambia el estado a "publicado" y actualiza el índice).
 *
 * Nota: como los cambios ya están en el repo desde el Guardar, otro
 * usuario que abra el panel los ve al instante. La distinción
 * "publicado / con cambios sin publicar" es un estado editorial
 * (¿Nico dio el OK final?), no una etapa de sincronización técnica.
 */

const KEY = 'panel_rel__drafts_v1';
const listeners = new Set();

function read() {
  try { return JSON.parse(localStorage.getItem(KEY) || '{}'); }
  catch { return {}; }
}
function write(obj) {
  try { localStorage.setItem(KEY, JSON.stringify(obj)); } catch {}
  for (const fn of listeners) { try { fn(); } catch(e){ console.error(e); } }
}

/** Suscripción a cambios en el conjunto de borradores. */
export function onDraftsChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/**
 * Marca que un barrio tiene un cambio pendiente de publicar.
 * @param {string} barrioId
 * @param {object} cambio  { tipo: 'info' | 'indicadores' | 'informe' | ..., mensaje: string }
 */
export function marcarCambio(barrioId, cambio) {
  const all = read();
  const b = all[barrioId] || { pendientes: [] };
  b.pendientes.push({ ...cambio, ts: new Date().toISOString() });
  all[barrioId] = b;
  write(all);
}

/** ¿El barrio tiene cambios sin publicar? */
export function tieneCambios(barrioId) {
  const all = read();
  return !!(all[barrioId] && all[barrioId].pendientes && all[barrioId].pendientes.length);
}

/** Devuelve el detalle de los cambios pendientes de un barrio. */
export function cambiosDe(barrioId) {
  const all = read();
  return (all[barrioId] && all[barrioId].pendientes) || [];
}

/** Set de IDs de barrios con cambios pendientes. */
export function idsConCambios() {
  const all = read();
  return new Set(Object.keys(all).filter(id => all[id]?.pendientes?.length));
}

/** Limpia los cambios pendientes de un barrio (se ejecuta al Publicar). */
export function limpiarCambios(barrioId) {
  const all = read();
  delete all[barrioId];
  write(all);
}
