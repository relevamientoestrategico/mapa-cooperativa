/**
 * Configuración central del panel.
 * Un solo lugar para modificar coordenadas del repositorio o textos globales.
 */

export const CONFIG = {
  // ── Repositorio de trabajo ────────────────────────────────
  // Ajustar owner/repo antes de publicar.
  repo: {
    owner:  'relevamientoestrategico',
    name: 'mapa-cooperativa',
    branch: 'main',
    dataPath: 'data/barrios'
  },

  // ── URL pública del mapa (para "Vista previa") ────────────
  mapaPublicoUrl: 'https://relevamientoestrategico.github.io/Mapa-Cooperativa/',

  // ── Claves de almacenamiento local ────────────────────────
  storage: {
    key:   'panel_rel__key_v1',        // clave de acceso cifrada del navegador
    prefs: 'panel_rel__prefs_v1'       // preferencias (sidebar colapsada, etc.)
  },

  // ── Estado inicial ────────────────────────────────────────
  defaultRoute: 'barrios'
};

/**
 * Rutas construidas a partir de la config.
 */
export const paths = {
  rawIndex: (owner = CONFIG.repo.owner, repo = CONFIG.repo.name, branch = CONFIG.repo.branch) =>
    `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${CONFIG.repo.dataPath}/index.json`,
  rawBarrio: (id) =>
    `https://raw.githubusercontent.com/${CONFIG.repo.owner}/${CONFIG.repo.name}/${CONFIG.repo.branch}/${CONFIG.repo.dataPath}/${id}/barrio.json`,
  rawGeometria: (id) =>
    `https://raw.githubusercontent.com/${CONFIG.repo.owner}/${CONFIG.repo.name}/${CONFIG.repo.branch}/${CONFIG.repo.dataPath}/${id}/geometria.geojson`,
  apiRoot: 'https://api.github.com'
};
