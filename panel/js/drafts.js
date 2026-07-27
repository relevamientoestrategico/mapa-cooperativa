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

/* ═══════════════════════════════════════════════════════════════════
   ARCHIVOS PENDIENTES DE ELIMINACIÓN
   ───────────────────────────────────────────────────────────────────
   Flujo diferido: cuando el usuario elimina una imagen en el editor
   y guarda, la referencia se saca del JSON pero el archivo físico
   queda en el repo. Recién al Publicar se ejecuta el borrado.

   Esto mantiene la consistencia con el resto del sistema (Guardar ≠
   Publicar) y permite "deshacer" un borrado antes de publicar
   sencillamente revirtiendo el JSON. Ver decisión #5 del Módulo 5.
   ═══════════════════════════════════════════════════════════════════ */

const KEY_ARCHIVOS = 'panel_rel__pending_deletes_v1';

function readDeletes() {
  try { return JSON.parse(localStorage.getItem(KEY_ARCHIVOS) || '{}'); }
  catch { return {}; }
}
function writeDeletes(obj) {
  try { localStorage.setItem(KEY_ARCHIVOS, JSON.stringify(obj)); } catch {}
  for (const fn of listeners) { try { fn(); } catch(e){ console.error(e); } }
}

/**
 * Marca un archivo para ser eliminado al publicar.
 * @param {string} barrioId
 * @param {string} path  ruta relativa completa dentro del repo
 */
export function marcarArchivoParaEliminar(barrioId, path) {
  const all = readDeletes();
  const list = all[barrioId] || [];
  if (!list.includes(path)) list.push(path);
  all[barrioId] = list;
  writeDeletes(all);
}

/**
 * Desmarca un archivo (por ejemplo, si el usuario cancela).
 */
export function desmarcarArchivo(barrioId, path) {
  const all = readDeletes();
  if (!all[barrioId]) return;
  all[barrioId] = all[barrioId].filter(p => p !== path);
  if (!all[barrioId].length) delete all[barrioId];
  writeDeletes(all);
}

/** Devuelve las rutas de archivos marcados para eliminar en un barrio. */
export function archivosParaEliminar(barrioId) {
  return readDeletes()[barrioId] || [];
}

/** Limpia la lista de archivos pendientes al terminar de publicar. */
export function limpiarArchivosParaEliminar(barrioId) {
  const all = readDeletes();
  delete all[barrioId];
  writeDeletes(all);
}
