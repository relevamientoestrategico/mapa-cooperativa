/**
 * Vista: lista de barrios.
 *
 * Ajustes de UX aplicados (revisión post-Módulo 2):
 *   1. Título dinámico: "N barrios relevados" en vez de "Barrios".
 *   2. Borradores al final de la grilla, con borde punteado.
 *   3. Búsqueda oculta hasta que haya 10+ barrios.
 *   4. Botón "Nuevo barrio" visible pero deshabilitado con tooltip
 *      "Disponible en el próximo módulo".
 */

import { el, mount, toast } from '../dom.js';
import { icons } from '../icons.js';
import { fetchIndex } from '../github.js';
import { session, canEdit, onSessionChange } from '../auth.js';
import { go } from '../router.js';
import { openConnectWizard } from '../ui/connect-wizard.js';
import { tieneCambios, onDraftsChange } from '../drafts.js';

const UMBRAL_BUSQUEDA = 10;   // umbral a partir del cual la búsqueda aparece

let allBarrios = [];
let searchTerm = '';

export async function renderBarrios(container) {
  container.innerHTML = '';

  const headSlot = el('div', { id: 'barrios-head-slot' });
  const toolbarSlot = el('div', { id: 'barrios-toolbar-slot' });
  const gridSlot = el('div', { id: 'barrios-grid-slot' });

  container.appendChild(headSlot);
  container.appendChild(toolbarSlot);
  container.appendChild(gridSlot);

  gridSlot.appendChild(el('div.loader-row', {}, [
    el('span.spinner'),
    'Cargando barrios…'
  ]));

  try {
    allBarrios = await fetchIndex({ bustCache: canEdit() });
    paintAll();
  } catch (e) {
    mount(gridSlot, el('div.callout.error', {}, [
      el('span', { html: icons.alert() }).firstChild,
      el('span', { text: e.message || 'No se pudo cargar el listado.' })
    ]));
  }

  onSessionChange(() => paintAll());
  onDraftsChange(() => paintGrid());
}

/**
 * Repinta todo (head + toolbar + grid) para reflejar cambios de sesión
 * o de conteo de barrios en un futuro.
 */
function paintAll() {
  paintHead();
  paintToolbar();
  paintGrid();
}

function paintHead() {
  const slot = document.getElementById('barrios-head-slot');
  if (!slot) return;

  // Conteo visible: en lectura solo publicados; conectado, todos
  const visibles = allBarrios.filter(b => b.estado === 'publicado' || canEdit());
  const n = visibles.length;

  const titulo = n === 0
    ? 'Sin barrios todavía'
    : `${n} ${n === 1 ? 'barrio relevado' : 'barrios relevados'}`;

  const head = el('div.page-head', {}, [
    el('div', {}, [
      el('h1', { text: titulo }),
      el('p.sub', { text: 'Elegí un barrio para consultarlo o administrarlo.' })
    ]),
    el('div.spacer')
  ]);

  // Botón "Nuevo barrio" — activo desde el Módulo 8
  if (canEdit()) {
    head.appendChild(el('button.btn.primary', {
      onClick: () => go('nuevo-barrio')
    }, [
      el('span', { html: icons.plus() }).firstChild,
      'Nuevo barrio'
    ]));
  }

  slot.replaceChildren(head);
}

function paintToolbar() {
  const slot = document.getElementById('barrios-toolbar-slot');
  if (!slot) return;

  // La búsqueda aparece solo cuando hay muchos barrios
  if (allBarrios.length < UMBRAL_BUSQUEDA) {
    slot.replaceChildren();
    return;
  }

  const toolbar = el('div.toolbar', {}, [
    el('div.search', {}, [
      el('span', { html: icons.search(), style: { color: 'var(--muted)' } }).firstChild,
      el('input', {
        type: 'search',
        placeholder: 'Buscar barrio…',
        value: searchTerm,
        onInput: (e) => { searchTerm = e.target.value.toLowerCase(); paintGrid(); }
      })
    ])
  ]);

  slot.replaceChildren(toolbar);
}

function paintGrid() {
  const slot = document.getElementById('barrios-grid-slot');
  if (!slot) return;

  // Filtro por permisos + búsqueda
  let list = allBarrios.filter(b => {
    if (b.estado !== 'publicado' && !canEdit()) return false;
    if (!searchTerm) return true;
    return b.nombreVisible.toLowerCase().includes(searchTerm);
  });

  // Ordenamiento: publicados primero, borradores al final
  list = list.slice().sort((a, b) => {
    const ap = a.estado === 'publicado' ? 0 : 1;
    const bp = b.estado === 'publicado' ? 0 : 1;
    return ap - bp;
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
  const conCambios = canEdit() && tieneCambios(b.id);

  return el(
    'button' + (isDraft ? '.barrio-card.is-draft' : '.barrio-card'),
    { onClick: () => go(`barrio/${b.id}`) },
    [
      el('div.top', {}, [
        el('div.cdot', { style: { background: b.color } }),
        el('span', {
          class: `pill ${isDraft ? 'draft' : 'pub'}`,
          html: `<span class="d"></span>${isDraft ? 'Borrador' : 'Publicado'}`
        })
      ]),
      el('div.name-row', {}, [
        el('h3', { text: b.nombreVisible }),
        conCambios ? el('span.change-dot', { title: 'Con cambios sin publicar' }) : null
      ].filter(Boolean))
    ]
  );
}
