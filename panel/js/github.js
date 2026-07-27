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

/**
 * Lee el archivo de puntos de interés del barrio.
 * Si el archivo no existe, devuelve una FeatureCollection vacía.
 */
export async function fetchPuntos(id, { bustCache = false } = {}) {
  const url = paths.rawPuntos(id) + (bustCache ? `?t=${Date.now()}` : '');
  const res = await fetch(url, { cache: bustCache ? 'no-store' : 'default' });
  if (res.status === 404) return { type: 'FeatureCollection', features: [] };
  if (!res.ok) throw new Error(`No se pudieron cargar los puntos de "${id}" (${res.status}).`);
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

  const url = `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}/contents/${encodePathForApi(path)}?ref=${CONFIG.repo.branch}&t=${Date.now()}`;
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

  const url = `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}/contents/${encodePathForApi(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...H_JSON, ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (res.status === 409 || res.status === 422) {
    // Conflicto o SHA obsoleto: otro editó mientras tanto.
    const e = new Error('Otra persona editó este archivo mientras vos estabas editando. Refrescá la página antes de volver a guardar. Tus cambios siguen acá.');
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

/**
 * Sube (crea o actualiza) un archivo de TEXTO (p. ej. HTML generado).
 * Misma semántica de conflictos que putJsonFile.
 */
export async function putTextFile({ path, text, message, sha }) {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    const e = new Error('Necesitás estar conectado para guardar cambios.');
    e.code = 'unauthorized';
    throw e;
  }
  const body = {
    message,
    content: encodeUtf8ToBase64(text),
    branch: CONFIG.repo.branch
  };
  if (sha) body.sha = sha;

  const url = `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}/contents/${encodePathForApi(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...H_JSON, ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 409 || res.status === 422) {
    const e = new Error('Otra persona editó este archivo mientras vos estabas editando. Refrescá la página antes de volver a guardar. Tus cambios siguen acá.');
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

/**
 * Sube (crea o actualiza) un archivo BINARIO.
 * El contenido ya viene codificado en base64 (así como lo produce
 * image-pipeline.js), evitando doble codificación.
 *
 * Sin `sha`: crea un archivo nuevo. Si ya existe con ese nombre,
 * GitHub devuelve 422 y este pipeline lo trata como conflicto.
 * Nuestro caso normal es "sin sha", porque el nombre = hash del
 * contenido, así que un archivo con el mismo nombre implica que
 * el contenido ya está subido (deduplicación).
 */
export async function putBinaryFile({ path, base64, message, sha }) {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    const e = new Error('Necesitás estar conectado para guardar cambios.');
    e.code = 'unauthorized';
    throw e;
  }
  const body = { message, content: base64, branch: CONFIG.repo.branch };
  if (sha) body.sha = sha;

  const url = `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}/contents/${encodePathForApi(path)}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: { ...H_JSON, ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (res.status === 409 || res.status === 422) {
    const e = new Error('Este archivo ya existe con otro contenido. No debería pasar con nombres derivados del contenido; si lo ves, avisá al soporte técnico.');
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
    throw new Error(`No se pudo guardar el archivo (${res.status}). ${detail.slice(0, 120)}`);
  }
  const payload = await res.json();
  return { ok: true, commit: payload.commit, sha: (payload.content || {}).sha };
}

/**
 * Verifica si un archivo existe en el repo. Devuelve el SHA si existe,
 * o null si no. Útil para no re-subir imágenes que ya están (dedupe).
 */
export async function fileExists(path) {
  try {
    const info = await fetchFileWithSha(path);
    return info.sha || null;
  } catch {
    return null;
  }
}

/**
 * Elimina un archivo del repo.
 * Requiere el SHA del archivo. Se usa en el flujo de Publicar para
 * borrar las imágenes que quedaron marcadas para eliminación.
 */
export async function deleteFile({ path, message, sha }) {
  const authHeader = getAuthHeader();
  if (!authHeader) {
    const e = new Error('Necesitás estar conectado para publicar cambios.');
    e.code = 'unauthorized';
    throw e;
  }
  if (!sha) throw new Error('Falta el SHA del archivo a eliminar.');

  const url = `${paths.apiRoot}/repos/${CONFIG.repo.owner}/${CONFIG.repo.name}/contents/${encodePathForApi(path)}`;
  const res = await fetch(url, {
    method: 'DELETE',
    headers: { ...H_JSON, ...authHeader, 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, sha, branch: CONFIG.repo.branch })
  });
  if (res.status === 404) {
    // Ya no existe: consideramos éxito silencioso.
    return { ok: true, alreadyGone: true };
  }
  if (res.status === 401 || res.status === 403) {
    const e = new Error('Tu clave de acceso ya no es válida. Reconectate.');
    e.code = 'unauthorized';
    throw e;
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`No se pudo eliminar el archivo (${res.status}). ${detail.slice(0, 120)}`);
  }
  return { ok: true };
}

/**
 * Codifica un path para la URL de la API respetando las barras.
 * encodeURIComponent codifica las barras y GitHub las necesita crudas.
 */
function encodePathForApi(path) {
  return path.split('/').map(encodeURIComponent).join('/');
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
