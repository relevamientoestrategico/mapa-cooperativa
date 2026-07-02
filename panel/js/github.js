/**
 * Adaptador de GitHub.
 *
 * Lectura: en modo solo lectura usa las URLs `raw.githubusercontent.com`,
 * que son públicas y no requieren clave. En modo conectado también las
 * usa (más rápidas), y la clave se reserva para escribir (Módulo 3+).
 *
 * Este módulo NO depende de auth.js para lectura, por lo que puede
 * usarse antes de saber si hay sesión.
 */

import { CONFIG, paths } from './config.js';

/**
 * Lee el manifiesto de barrios.
 * @param {boolean} bustCache - agrega parámetro para evitar caché del CDN.
 * @returns {Promise<Array>} array de entradas del índice.
 */
export async function fetchIndex({ bustCache = false } = {}) {
  const url = paths.rawIndex() + (bustCache ? `?t=${Date.now()}` : '');
  const res = await fetch(url, { cache: bustCache ? 'no-store' : 'default' });
  if (!res.ok) throw new Error(`No se pudo cargar la lista de barrios (${res.status}).`);
  const json = await res.json();
  return json.barrios || [];
}

/** Lee el barrio.json completo de un barrio. */
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
