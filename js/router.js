/**
 * Router mínimo basado en hash (#/barrios, #/barrio/villa-adela).
 * Preferimos hash para funcionar en GitHub Pages sin configuración de servidor.
 */

const routes = new Map();
const listeners = new Set();

/** Registra una ruta. `pattern` puede ser 'barrios' o 'barrio/:id'. */
export function route(pattern, handler) {
  routes.set(pattern, handler);
}

/** Suscripción a cambios de ruta (para actualizar sidebar activo, etc.). */
export function onRouteChange(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Navega. `path` sin el "#/" inicial. */
export function go(path) {
  const target = '#/' + path.replace(/^#?\/?/, '');
  if (location.hash === target) resolve();  // mismo path: forzamos re-render
  else location.hash = target;
}

function parse(hash) {
  const clean = hash.replace(/^#\/?/, '');
  const parts = clean.split('/').filter(Boolean);
  return parts;
}

function resolve() {
  const parts = parse(location.hash);
  if (parts.length === 0) parts.push('barrios');

  for (const [pattern, handler] of routes) {
    const pp = pattern.split('/');
    if (pp.length !== parts.length) continue;
    const params = {};
    let match = true;
    for (let i = 0; i < pp.length; i++) {
      if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(parts[i]);
      else if (pp[i] !== parts[i]) { match = false; break; }
    }
    if (match) {
      const active = pp[0];   // primer segmento identifica la sección
      for (const fn of listeners) { try { fn({ pattern, params, active }); } catch(e){console.error(e);} }
      handler(params);
      return;
    }
  }
  // Ninguna coincide: enviar a raíz
  if (parts.join('/') !== 'barrios') go('barrios');
}

/** Inicia el router. Llamar una sola vez al bootear la app. */
export function start() {
  window.addEventListener('hashchange', resolve);
  resolve();
}
