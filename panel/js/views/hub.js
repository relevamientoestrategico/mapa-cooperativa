/**
 * Vista: Hub del barrio.
 * Muestra el barrio y las tareas disponibles. En modo lectura las tarjetas
 * se ven pero están bloqueadas con un tooltip claro.
 */

import { el, mount, toast, fechaLarga } from '../dom.js';
import { icons } from '../icons.js';
import { fetchBarrio } from '../github.js';
import { canEdit, onSessionChange } from '../auth.js';
import { go } from '../router.js';
import { openConnectWizard } from '../ui/connect-wizard.js';
import { CONFIG } from '../config.js';

const TAREAS = [
  { id: 'info',         label: 'Editar información general', hint: 'Nombre, zona y color',                icon: icons.edit },
  { id: 'indicadores',  label: 'Editar indicadores',         hint: 'Los datos que se ven en la ficha',    icon: icons.chart },
  { id: 'informe',      label: 'Editar informe',             hint: 'Texto completo del relevamiento',     icon: icons.file },
  { id: 'imagenes',     label: 'Administrar imágenes',       hint: 'Fotos del barrio y galería',          icon: icons.image },
  { id: 'puntos',       label: 'Puntos de interés',          hint: 'Escuelas, comedores, salud',          icon: icons.pin },
  { id: 'limites',      label: 'Actualizar límites',         hint: 'La zona dibujada en el mapa',         icon: icons.map },
  { id: 'historial',    label: 'Ver historial',              hint: 'Relevamientos anteriores',            icon: icons.clock },
  { id: 'preview',      label: 'Vista previa',               hint: 'Cómo se ve en el mapa público',       icon: icons.eye }
];

export async function renderHub(container, { id }) {
  container.innerHTML = '';

  container.appendChild(el('a.back-link', {
    onClick: (e) => { e.preventDefault(); go('barrios'); },
    href: '#/barrios'
  }, [
    el('span', { html: icons.chevronLeft() }).firstChild,
    'Barrios'
  ]));

  const loading = el('div.loader-row', {}, [el('span.spinner'), 'Cargando barrio…']);
  container.appendChild(loading);

  let barrio;
  try {
    barrio = await fetchBarrio(id, { bustCache: canEdit() });
  } catch (e) {
    loading.remove();
    container.appendChild(el('div.callout.error', {}, [
      el('span', { html: icons.alert() }).firstChild,
      el('span', { text: e.message || 'No se pudo cargar el barrio.' })
    ]));
    return;
  }
  loading.remove();

  container.appendChild(buildHead(barrio));
  container.appendChild(el('p.sec-label', { text: canEdit() ? '¿Qué querés hacer?' : 'Acciones disponibles' }));
  container.appendChild(buildTiles(barrio));
  container.appendChild(buildActions(barrio));

  // Repintar tiles al cambiar estado de sesión (sin recargar datos)
  const unsubscribe = onSessionChange(() => {
    // Sólo repinta si seguimos en esta vista
    if (!document.body.contains(container)) { unsubscribe(); return; }
    const tilesSlot = container.querySelector('.tiles');
    if (tilesSlot) tilesSlot.replaceWith(buildTiles(barrio));
    const actionsSlot = container.querySelector('.hub-actions');
    if (actionsSlot) actionsSlot.replaceWith(buildActions(barrio));
    const labelSlot = container.querySelector('.sec-label');
    if (labelSlot) labelSlot.textContent = canEdit() ? '¿Qué querés hacer?' : 'Acciones disponibles';
  });
}

function buildHead(b) {
  const isDraft = b.estado !== 'publicado';
  const subChildren = [
    el('span', { class: `pill ${isDraft ? 'draft' : 'pub'}`, html: `<span class="d"></span>${isDraft ? 'Borrador' : 'Publicado'}` }),
    b.zona ? el('span', { text: b.zona }) : null,
    b.fechaActualizacion
      ? el('span', { text: `Último relevamiento: ${fechaLarga(b.fechaActualizacion)}` })
      : el('span', { text: 'Aún no se registró una fecha de relevamiento' })
  ].filter(Boolean);

  return el('div.hub-head', {}, [
    el('div.cdot', { style: { background: b.color } }),
    el('div', {}, [
      el('h1', { text: b.nombreVisible }),
      el('div.sub', {}, subChildren)
    ])
  ]);
}

function buildTiles(b) {
  const locked = !canEdit();
  const grid = el('div.tiles');
  for (const t of TAREAS) {
    const isPreview = t.id === 'preview';       // "Vista previa" siempre disponible
    const isHistorial = t.id === 'historial';   // "Historial" también en lectura
    const isReadable = isPreview || isHistorial;
    const disabled = locked && !isReadable;

    const tile = el('button' + (disabled ? '.tile.locked' : '.tile'), {
      onClick: () => onTile(t, b, disabled),
      title: disabled ? 'Conectate para editar' : t.label
    }, [
      el('div.ib', { html: t.icon() }),
      el('b', { text: t.label }),
      el('span', { text: t.hint }),
      disabled ? el('span.lock-mark', { html: icons.lock() }) : null
    ].filter(Boolean));

    grid.appendChild(tile);
  }
  return grid;
}

function onTile(t, b, disabled) {
  if (disabled) {
    openConnectWizard();
    return;
  }
  if (t.id === 'preview') {
    window.open(CONFIG.mapaPublicoUrl, '_blank', 'noopener');
    return;
  }
  toast(`El editor de "${t.label.toLowerCase()}" se implementa en el próximo módulo.`, 'ok');
}

function buildActions(b) {
  const row = el('div.hub-actions');
  if (canEdit()) {
    row.append(
      el('button.btn.primary', {
        onClick: () => toast('El flujo de publicar cambios llega en el próximo módulo.', 'ok')
      }, [
        el('span', { html: icons.upload() }).firstChild,
        'Publicar cambios'
      ]),
      el('button.btn', {
        onClick: () => window.open(CONFIG.mapaPublicoUrl, '_blank', 'noopener')
      }, [
        el('span', { html: icons.eye() }).firstChild,
        'Vista previa'
      ])
    );
  } else {
    row.append(
      el('button.btn.primary', { onClick: openConnectWizard }, [
        el('span', { html: icons.key() }).firstChild,
        'Conectar para editar'
      ]),
      el('button.btn', {
        onClick: () => window.open(CONFIG.mapaPublicoUrl, '_blank', 'noopener')
      }, [
        el('span', { html: icons.eye() }).firstChild,
        'Ver en el mapa público'
      ])
    );
  }
  return row;
}
