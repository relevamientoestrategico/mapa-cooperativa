/**
 * Vista: lista de barrios.
 *
 * Modo lectura: muestra solo barrios publicados.
 * Modo conectado: además muestra borradores (con badge) y el botón "Nuevo barrio"
 * (en Módulos 3+ se cablea el asistente).
 */

import { el, mount, toast } from '../dom.js';
import { icons } from '../icons.js';
import { fetchIndex } from '../github.js';
import { session, canEdit, onSessionChange } from '../auth.js';
import { go } from '../router.js';
import { openConnectWizard } from '../ui/connect-wizard.js';

let allBarrios = [];
let searchTerm = '';

export async function renderBarrios(container) {
  container.innerHTML = '';
  container.appendChild(buildHead());
  container.appendChild(buildToolbar());

  const gridSlot = el('div', { id: 'barrios-grid-slot' });
  container.appendChild(gridSlot);
  gridSlot.appendChild(el('div.loader-row', {}, [
    el('span.spinner'),
    'Cargando barrios…'
  ]));

  try {
    allBarrios = await fetchIndex({ bustCache: canEdit() });
    paintGrid();
  } catch (e) {
    mount(gridSlot, el('div.callout.error', {}, [
      el('span', { html: icons.alert() }).firstChild,
      el('span', { text: e.message || 'No se pudo cargar el listado.' })
    ]));
  }

  // Refrescar cuando cambia el estado de sesión (para mostrar/ocultar borradores)
  onSessionChange(() => paintGrid());
}

function buildHead() {
  const head = el('div.page-head', {}, [
    el('div', {}, [
      el('h1', { text: 'Barrios' }),
      el('p.sub', { text: 'Elegí un barrio para consultarlo o administrarlo.' })
    ]),
    el('div.spacer')
  ]);

  if (canEdit()) {
    head.appendChild(el('button.btn.primary', {
      onClick: () => toast('El asistente de "Nuevo barrio" llega en el próximo módulo.', 'ok')
    }, [
      el('span', { html: icons.plus() }).firstChild,
      'Nuevo barrio'
    ]));
  }

  return head;
}

function buildToolbar() {
  return el('div.toolbar', {}, [
    el('div.search', {}, [
      el('span', { html: icons.search(), style: { color: 'var(--muted)' } }).firstChild,
      el('input', {
        type: 'search',
        placeholder: 'Buscar barrio…',
        onInput: (e) => { searchTerm = e.target.value.toLowerCase(); paintGrid(); }
      })
    ])
  ]);
}

function paintGrid() {
  const slot = document.getElementById('barrios-grid-slot');
  if (!slot) return;

  // Filtro por permisos + búsqueda
  const list = allBarrios.filter(b => {
    if (b.estado !== 'publicado' && !canEdit()) return false;
    if (!searchTerm) return true;
    return b.nombreVisible.toLowerCase().includes(searchTerm);
  });

  slot.innerHTML = '';

  if (list.length === 0) {
    slot.appendChild(el('div.empty', {}, [
      el('div', { html: `<svg class="ico ico-lg" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="m21 21-4.3-4.3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>` }),
      el('h3', { text: 'Sin resultados' }),
      el('p', { text: 'No encontramos ningún barrio con ese nombre. Probá con otras palabras.' })
    ]));
    return;
  }

  const grid = el('div.barrios-grid');
  for (const b of list) grid.appendChild(cardOf(b));
  slot.appendChild(grid);
}

function cardOf(b) {
  const isDraft = b.estado !== 'publicado';
  return el('button.barrio-card', {
    onClick: () => go(`barrio/${b.id}`)
  }, [
    el('div.top', {}, [
      el('div.cdot', { style: { background: b.color } }),
      el('span', {
        class: `pill ${isDraft ? 'draft' : 'pub'}`,
        html: `<span class="d"></span>${isDraft ? 'Borrador' : 'Publicado'}`
      })
    ]),
    el('h3', { text: b.nombreVisible })
  ]);
}
