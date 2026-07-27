/**
 * Motor de historial (Módulo 7).
 *
 * Consulta el historial de commits del repo vía API de GitHub y lo
 * traduce a "entradas de historial" legibles por humanos, listas para
 * mostrar en la UI. Toda la traducción de nombres técnicos de archivos a
 * frases castellanas ocurre acá — la vista nunca ve un path.
 *
 * Diseño:
 *   1. fetchCommits(): trae commits crudos de la API, con paginación.
 *   2. parseCommit(): convierte un commit crudo en una entrada tipada.
 *   3. filtrarEntradas(): aplica los filtros de la UI (fecha, autor, tipo).
 *
 * Filtros por barrio: se hacen del lado del servidor con el parámetro
 * `path` de la API de GitHub (solo trae commits que tocaron esa carpeta).
 * Es más rápido y ahorra ancho de banda que traer todo y filtrar.
 *
 * Los mensajes de commit ya vienen bien formateados desde M3/M4/M5/M6
 * gracias a commitMessage() (ej: "Villa Adela: informe actualizado"),
 * así que la traducción es principalmente para el "resumen de cambios"
 * — qué se tocó realmente basado en los paths de archivos afectados.
 */

import { CONFIG, paths } from './config.js';
import { getAuthHeader } from './auth.js';

const API_ROOT = paths.apiRoot;
const REPO = `${CONFIG.repo.owner}/${CONFIG.repo.name}`;

/**
 * Trae commits desde la API de GitHub.
 * @param {object} params
 *   - path?: string   Filtrar a los commits que tocaron esa ruta.
 *   - perPage?: number  Cantidad por página (máximo 100, default 50).
 *   - page?: number    Página (default 1).
 *   - since?: string   Fecha ISO desde la cual traer (opcional).
 *   - until?: string   Fecha ISO hasta la cual traer (opcional).
 *   - author?: string  Filtrar por autor (login o email).
 * @returns {Promise<{commits: Commit[], hayMas: boolean}>}
 */
export async function fetchCommits({ path, perPage = 50, page = 1, since, until, author } = {}) {
  const params = new URLSearchParams({ per_page: String(perPage), page: String(page) });
  if (path) params.set('path', path);
  if (since) params.set('since', since);
  if (until) params.set('until', until);
  if (author) params.set('author', author);

  const url = `${API_ROOT}/repos/${REPO}/commits?${params.toString()}`;
  const authHeader = getAuthHeader();
  const headers = { Accept: 'application/vnd.github+json' };
  if (authHeader) Object.assign(headers, authHeader);

  const res = await fetch(url, { headers });
  if (res.status === 404) {
    // Sin coincidencias (por ejemplo, path que nunca existió)
    return { commits: [], hayMas: false };
  }
  if (res.status === 401 || res.status === 403) {
    const e = new Error('Necesitás estar conectado para ver el historial.');
    e.code = 'unauthorized';
    throw e;
  }
  if (!res.ok) {
    throw new Error(`No se pudo cargar el historial (${res.status}).`);
  }

  const rawCommits = await res.json();
  // La API no te dice explícitamente si hay más páginas, pero si vino la
  // cantidad que pediste, probablemente sí.
  const hayMas = rawCommits.length === perPage;
  return { commits: rawCommits, hayMas };
}

/**
 * Trae los archivos que tocó un commit específico.
 * La API de /commits sin este endpoint no incluye el detalle de archivos
 * afectados (para no inflar la respuesta). Lo pedimos on-demand cuando
 * necesitamos el resumen de cambios de una entrada.
 *
 * Nunca lanza excepción: si falla (rate limit, red, etc.), devuelve
 * lista vacía y el resumen usará solo el mensaje del commit.
 */
export async function fetchArchivosDeCommit(sha) {
  try {
    const url = `${API_ROOT}/repos/${REPO}/commits/${sha}`;
    const authHeader = getAuthHeader();
    const headers = { Accept: 'application/vnd.github+json' };
    if (authHeader) Object.assign(headers, authHeader);
    const res = await fetch(url, { headers });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.files || []).map(f => ({
      path: f.filename,
      accion: f.status,
      lineasMas: f.additions,
      lineasMenos: f.deletions
    }));
  } catch {
    return [];
  }
}

/**
 * Traduce un commit + sus archivos afectados a una entrada legible.
 *
 * @param {object} commit  Objeto crudo de la API de commits.
 * @param {Array}  archivos  Archivos afectados (fetchArchivosDeCommit).
 * @returns {EntradaHistorial}
 */
export function parseCommit(commit, archivos = []) {
  const c = commit.commit || {};
  const author = commit.author || {};
  const nombreCompleto = c.author?.name || author.login || 'Desconocido';
  const login = author.login || null;

  // Analizar los paths para inferir qué se cambió realmente.
  const cambios = clasificarCambios(archivos);

  // Detectar el barrio a partir del mensaje de commit (si tiene el
  // formato "Nombre Visible: acción") o de los paths tocados.
  const barrio = detectarBarrio(c.message || '', archivos);

  // Resumen legible en frase completa.
  const resumen = construirResumenLegible(cambios, c.message || '', archivos);

  return {
    sha: commit.sha,
    fecha: new Date(c.author?.date || c.committer?.date || Date.now()),
    autor: {
      nombre: nombreCompleto,
      login: login,
      avatarUrl: author.avatar_url || null
    },
    barrio: barrio,
    mensaje: c.message || '',
    resumen: resumen,
    tipos: [...new Set(cambios.map(c => c.tipo))],
    // Marca "esRelevante" para que la vista pueda decidir si ocultarlo.
    // Un commit es relevante si tocó al menos un archivo del contenido
    // editable del panel, o si su mensaje sigue el formato "Nombre: acción"
    // (cambios hechos desde el panel siempre son relevantes).
    esRelevante: cambios.length > 0 || /^[^:]+:\s+.+/.test(c.message || ''),
    urlEnGitHub: commit.html_url,
    _archivos: archivos
  };
}

/**
 * Aplica los filtros de la UI a una lista de entradas ya parseadas.
 *
 * @param {EntradaHistorial[]} entradas
 * @param {object} filtros
 *   - desde?: Date       Fecha mínima (inclusive)
 *   - hasta?: Date       Fecha máxima (inclusive)
 *   - autor?: string     Nombre o login del autor
 *   - tipo?: string      'informe' | 'mapa' | 'indicadores' | 'imagenes' | etc.
 * @returns {EntradaHistorial[]}
 */
export function filtrarEntradas(entradas, filtros = {}) {
  return entradas.filter(e => {
    if (filtros.desde && e.fecha < filtros.desde) return false;
    if (filtros.hasta && e.fecha > filtros.hasta) return false;
    if (filtros.autor) {
      const q = filtros.autor.toLowerCase();
      const nombre = (e.autor.nombre || '').toLowerCase();
      const login = (e.autor.login || '').toLowerCase();
      if (!nombre.includes(q) && !login.includes(q)) return false;
    }
    if (filtros.tipo && !e.tipos.includes(filtros.tipo)) return false;
    return true;
  });
}

/**
 * Formatea una fecha en algo humano.
 *   - Si es hoy: "Hoy a las 15:30"
 *   - Si es ayer: "Ayer a las 15:30"
 *   - Si es de esta semana: "Martes a las 15:30"
 *   - Más viejo: "12 de julio a las 15:30"
 */
export function formatearFecha(fecha) {
  const ahora = new Date();
  const hoy = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate());
  const ayer = new Date(hoy.getTime() - 86400000);
  const fdia = new Date(fecha.getFullYear(), fecha.getMonth(), fecha.getDate());
  const hora = fecha.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });
  if (fdia.getTime() === hoy.getTime()) return `Hoy a las ${hora}`;
  if (fdia.getTime() === ayer.getTime()) return `Ayer a las ${hora}`;
  // Si es de los últimos 6 días, mostrar día de la semana
  const diffDias = Math.floor((hoy - fdia) / 86400000);
  if (diffDias < 7) {
    const diasSemana = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
    const dia = diasSemana[fecha.getDay()];
    return `${dia.charAt(0).toUpperCase() + dia.slice(1)} a las ${hora}`;
  }
  const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
  return `${fecha.getDate()} de ${meses[fecha.getMonth()]} a las ${hora}`;
}

/* ═══════════════════════════════════════════════════════════════════
   Traducción de paths → cambios legibles
   ═══════════════════════════════════════════════════════════════════ */

/**
 * A partir de la lista de archivos afectados, deduce qué tipo de cambio
 * es cada uno. Ignora archivos técnicos (config, código).
 *
 * Acepta indistintamente el formato crudo de la API (path via `filename`,
 * acción via `status`) o el formato normalizado que devuelve
 * fetchArchivosDeCommit (path via `path`, acción via `accion`).
 */
function clasificarCambios(archivos) {
  const cambios = [];
  for (const a of archivos) {
    const path = a.path || a.filename;
    const accion = a.accion || a.status;
    const tipo = tipoDePath(path);
    if (!tipo) continue;
    cambios.push({ path, accion, tipo });
  }
  return cambios;
}

/**
 * Devuelve el tipo semántico de un path.
 * Si el path no es parte del contenido editable del panel, devuelve null.
 */
function tipoDePath(path) {
  if (!path) return null;
  // Archivos técnicos del panel — no son "cambios del barrio"
  if (path.startsWith('panel/')) return null;
  if (path === 'index.html' || path.startsWith('css/') || path.startsWith('js/')) return null;
  if (path === 'README.md' || path === '.gitignore') return null;

  // Datos de barrios
  if (/^data\/barrios\/[^/]+\/barrio\.json$/.test(path)) return 'informacion';
  if (/^data\/barrios\/[^/]+\/informe\.json$/.test(path)) return 'informe';
  if (/^data\/barrios\/[^/]+\/geometria\.geojson$/.test(path)) return 'mapa';
  if (/^data\/barrios\/[^/]+\/puntos\.geojson$/.test(path)) return 'mapa';
  if (/^data\/barrios\/[^/]+\/adjuntos\/galeria\//.test(path)) return 'imagenes';
  if (/^data\/barrios\/[^/]+\/adjuntos\//.test(path)) return 'imagenes';
  if (path === 'data/barrios/index.json') return 'informacion';

  // HTMLs de informe (regenerados por el editor)
  if (/^Relevamiento .+\.html$/.test(path)) return 'informe';

  // Fotos de galería sueltas en la raíz (legado M4)
  if (/\.(jpg|jpeg|png)$/i.test(path) && !path.startsWith('data/')) return 'imagenes';

  return null;
}

/**
 * Detecta el barrio a partir del mensaje o de los paths afectados.
 * El formato de commit "Nombre Visible: acción" nos da el nombre, pero
 * no el slug. El slug lo sacamos de los paths.
 */
function detectarBarrio(mensaje, archivos) {
  const m = mensaje.match(/^([^:]+):/);
  const nombreVisible = m ? m[1].trim() : null;

  let slug = null;
  for (const a of archivos) {
    const path = a.path || a.filename;
    const sm = (path || '').match(/^data\/barrios\/([^/]+)\//);
    if (sm) { slug = sm[1]; break; }
  }
  if (!slug && !nombreVisible) return null;
  return { id: slug, nombreVisible };
}

/**
 * Construye una frase legible que describe los cambios.
 * Prioriza el mensaje de commit si está bien formateado; si no, arma
 * una frase a partir del conteo de tipos.
 */
function construirResumenLegible(cambios, mensajeCommit, archivos) {
  // Caso 1: sin cambios en contenido editable Y sin formato "Nombre: acción".
  // Ejemplo: "Update index.html" (edición técnica hecha desde GitHub).
  // Marcamos como "sin cambios visibles" — la vista lo filtra por
  // esRelevante, pero por si acaso llegamos acá con algo, damos un
  // resumen suave.
  if (!cambios.length && !mensajeCommit.includes(':')) {
    if (mensajeCommit.trim()) {
      return `Cambio técnico (${mensajeCommit.trim().slice(0, 60)})`;
    }
    return 'Cambio sin descripción';
  }

  // Caso 2: mensaje con formato "Nombre: acción" — es un commit del panel.
  const m = mensajeCommit.match(/^[^:]+:\s*(.+)$/s);
  const accion = m ? m[1].trim().replace(/\s+/g, ' ') : null;

  // Refinamos el resumen sumando conteo cuando aplica.
  // Ejemplo: "foto agregada a la galería" + 3 imágenes en el commit =
  // "Se agregaron 3 fotos a la galería".
  const conteo = contarPorAccion(cambios);

  if (accion) {
    if (accion.startsWith('foto agregada') && conteo.imagenesAgregadas > 1) {
      return `Se agregaron ${conteo.imagenesAgregadas} fotos a la galería`;
    }
    if (accion.startsWith('foto eliminada') && conteo.imagenesEliminadas > 1) {
      return `Se eliminaron ${conteo.imagenesEliminadas} fotos de la galería`;
    }
    return accion.charAt(0).toUpperCase() + accion.slice(1);
  }

  // Caso 3: mensaje sin formato reconocible, pero sí hubo cambios de
  // contenido — armamos el resumen a partir del conteo.
  return armarResumenPorConteo(cambios);
}

function armarResumenPorConteo(cambios) {
  const c = contarPorAccion(cambios);
  const partes = [];
  if (c.informacion) partes.push('la información general');
  if (c.informe) partes.push('el informe');
  if (c.mapa) partes.push('el mapa');
  if (c.imagenesAgregadas === 1) partes.push('una foto');
  else if (c.imagenesAgregadas > 1) partes.push(`${c.imagenesAgregadas} fotos`);

  if (!partes.length) return 'Cambios en el barrio';
  return `Se actualizó ${partes.join(', ')}`;
}

function contarPorAccion(cambios) {
  const c = {
    informacion: 0, informe: 0, mapa: 0,
    imagenesAgregadas: 0, imagenesEliminadas: 0, imagenesModificadas: 0
  };
  for (const cam of cambios) {
    if (cam.tipo === 'informacion') c.informacion++;
    else if (cam.tipo === 'informe') c.informe++;
    else if (cam.tipo === 'mapa') c.mapa++;
    else if (cam.tipo === 'imagenes') {
      if (cam.accion === 'added') c.imagenesAgregadas++;
      else if (cam.accion === 'removed') c.imagenesEliminadas++;
      else c.imagenesModificadas++;
    }
  }
  return c;
}
