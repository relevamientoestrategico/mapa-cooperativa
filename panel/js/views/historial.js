/**
 * Punto de entrada del historial por barrio y global.
 *
 * Ambas variantes son un contenedor mínimo que instancia la vista
 * compartida `montarHistorial()`. La lógica pesada vive en historial-vista.js.
 */

import { el } from '../dom.js';
import { go } from '../router.js';
import { canEdit } from '../auth.js';
import { fetchBarrio } from '../github.js';
import { montarHistorial } from './historial-vista.js';

/** Renderiza el historial de un barrio específico. */
export async function renderHistorialBarrio(container, params) {
  container.innerHTML = '';
  if (!canEdit()) {
    container.appendChild(el('div.callout.warn', {}, [
      el('span', { text: 'Necesitás estar conectado con permisos para ver el historial.' })
    ]));
    return;
  }
  const id = params.id;
  let barrio;
  try {
    barrio = await fetchBarrio(id, { bustCache: true });
  } catch (e) {
    container.appendChild(el('div.callout.err', {}, [
      el('span', { text: `No se pudo cargar el barrio: ${e.message}` })
    ]));
    return;
  }
  await montarHistorial(container, {
    modo: 'barrio',
    barrio: { id, nombreVisible: barrio.nombreVisible },
    onSalir: () => go(`barrio/${id}`)
  });
}

/** Renderiza el historial global de todos los barrios. */
export async function renderHistorialGlobal(container) {
  container.innerHTML = '';
  if (!canEdit()) {
    container.appendChild(el('div.callout.warn', {}, [
      el('span', { text: 'Necesitás estar conectado con permisos para ver el historial.' })
    ]));
    return;
  }
  await montarHistorial(container, {
    modo: 'global',
    onSalir: () => go('barrios')
  });
}
