/**
 * Adaptador de GitHub — LECTURA y ESCRITURA.
 *
 * Lectura pública:  raw.githubusercontent.com  (sin clave, más rápido)
 * Lectura con SHA:  api.github.com/repos/.../contents/  (requiere clave;
 *                   devuelve el SHA que necesitamos para escribir)
 * Escritura:        PUT api.github.com/repos/.../contents/  (con clave)
 *
 * Detección de conflictos (Decisión #3 del Módulo 3):
 *   Cada archivo en GitHub tiene un SHA único que cambia cuando cambia
 *   el contenido. Cuando vamos a guardar, mandamos el SHA que teníamos
 *   al leer. Si otra persona modificó el archivo mientras tanto, el
 *   SHA es distinto y GitHub rechaza el commit con un 409 Conflict.
 *   Eso es lo que nos permite avisarle al usuario en vez de pisar
 *   silenciosamente los cambios ajenos.
 */

import { CONFIG, paths } from './config.js';
import { getAuthHeader } from './auth.js';

const H_JSON = { Accept: 'application/vnd.github+json' };

/* ═══════════════════════════════════════════════════════════════════
   LECTURA
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Lee el manifiesto de barrios (índice liviano).
 * @param {boolean} bustCache - evita caché del CDN.
 */
export async function fetchIndex({ bustCache = false } = {}) {
  const url = paths.rawIndex() + (bustCache ? `?t=${Date.now()}` : '');
  const res = await fetch(url, { cache: bustCache ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`No se pudo cargar la lista de barrios (${res.status}).`);
  const json = await res.json();
  return json.barrios || [];
}

/** Lee el barrio.json de un barrio. */
export async function fetchBarrio(id, { bustCache = false } = {}) {
  const url = paths.rawBarrio(id) + (bustCache ? `?t=${Date.now()}` : '');
  const res = await fetch(url, { cache: bustCache ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`No se pudo cargar el barrio "${id}" (${res.status}).`);
  return res.json();
}

/** Lee la geometría (GeoJSON) de un barrio. */
export async function fetchGeometria(id, { bustCache = false } = {}) {
  const url = paths.rawGeometria(id) + (bustCache ? `?t=${Date.now()}` : '');
  const res = await fetch(url, { cache: bustCache ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`No se pudo cargar la geometría de "${id}" (${res.status}).`);
  return res.json();
}

/* ═══════════════════════════════════════════════════════════════════
   LECTURA CON SHA — para preparar una escritura futura
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Lee un archivo del repo vía API autenticada, devolviendo su SHA.
 * El SHA es lo que nos permite detectar conflictos al escribir.
 *
 * @param {string} path  ruta del archivo dentro del repo
 * @returns {Promise<{ data: any, sha: string, path: string }>}
 */
export async function fetchFileWithSha(path) {
  const authHeader = getAuthHeader();
  if (!authHeader) throw new Error('Necesitás estar conectado para editar.');

  const url = `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}/contents/${encodeURIComponent(path)}?ref=${CONFIG.repo.branch}&t=${Date.now()}`;
  const res = await fetch(url, {
    headers: { ...H_JSON, ...authHeader },
    cache: 'no-store'
  });
  if (res.status === 404) {
    return { data: null, sha: null, path };   // archivo aún no existe
  }
  if (!res.ok) {
    throw new Error(`No se pudo leer "${path}" (${res.status}).`);
  }
  const meta = await res.json();
  // GitHub devuelve el contenido en base64 (con saltos de línea).
  // Lo decodificamos como UTF-8 correctamente.
  const decoded = decodeUtf8FromBase64(meta.content);
  let data;
  try { data = JSON.parse(decoded); }
  catch { data = decoded; }   // en caso de que no sea JSON
  return { data, sha: meta.sha, path };
}

/* ═══════════════════════════════════════════════════════════════════
   ESCRITURA
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Sube (crea o actualiza) un archivo JSON al repo, con mensaje de commit.
 *
 * @param {object} args
 * @param {string} args.path      ruta del archivo dentro del repo
 * @param {any}    args.content   objeto a serializar como JSON
 * @param {string} args.message   mensaje del commit
 * @param {string|null} args.sha  SHA de la versión que estás sobrescribiendo
 *                                 (null si el archivo es nuevo)
 * @returns {Promise<{ok: true, commit: object}>}
 * @throws  Error con code === 'conflict' si otro editó mientras tanto,
 *          o code === 'unauthorized' si la clave dejó de servir.
 */
export async function putJsonFile({ path, content, message, sha }) {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    const e = new Error('Necesitás estar conectado para guardar cambios.');
    e.code = 'unauthorized';
    throw e;
  }

  const jsonText = JSON.stringify(content, null, 2) + '\n';
  const body = {
    message,
    content: encodeUtf8ToBase64(jsonText),
    branch: CONFIG.repo.branch
  };
  if (sha) body.sha = sha;

  const url = `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}/contents/${encodeURIComponent(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...H_JSON, ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.status === 409 || res.status === 422) {
    // Conflicto o SHA obsoleto: otro editó mientras tanto.
    const e = new Error('Otra persona modificó este archivo mientras vos estabas editando. Refrescá para ver los cambios más recientes antes de volver a guardar.');
    e.code = 'conflict';
    throw e;
  }
  if (res.status === 401 || res.status === 403) {
    const e = new Error('Tu clave de acceso ya no es válida. Reconectate para seguir editando.');
    e.code = 'unauthorized';
    throw e;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`No se pudo guardar (${res.status}). ${detail.slice(0, 120)}`);
  }

  const payload = await res.json();
  return { ok: true, commit: payload.commit };
}

/* ═══════════════════════════════════════════════════════════════════
   MENSAJES DE COMMIT — formato humano con timestamp local
   ═══════════════════════════════════════════════════════════════════ */

/**
 * Formatea un mensaje de commit según el patrón aprobado (Opción A):
 *   "Villa Adela: información general actualizada"
 *
 * La fecha y hora exactas quedan en el timestamp propio de Git.
 * Una futura pantalla "Historial de cambios" mostrará ambas cosas
 * juntas, formateadas para leer.
 *
 * @param {string} nombreVisible  nombre del barrio en la UI
 * @param {string} accion         qué se hizo, en minúsculas y verbo participio
 */
export function commitMessage(nombreVisible, accion) {
  return `${nombreVisible}: ${accion}`;
}

/* ═══════════════════════════════════════════════════════════════════
   HELPERS base64 UTF-8 seguros
   ═══════════════════════════════════════════════════════════════════ */

function encodeUtf8ToBase64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function decodeUtf8FromBase64(b64) {
  const clean = (b64 || '').replace(/\s/g, '');
  const bin = atob(clean);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}
