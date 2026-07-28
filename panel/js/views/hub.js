/**
 * Vista: Hub del barrio.
 *
 * Módulo 3 agregó:
 *   - Pill "Con cambios sin publicar" cuando hay borradores
 *   - Botón "Publicar cambios" se activa solo si hay algo que publicar
 *   - Enrutamiento a los editores (por ahora, solo "info")
 */

import { el, mount, toast, fechaLarga } from '../dom.js';
import { icons } from '../icons.js';
import { fetchBarrio } from '../github.js';
import { canEdit, session, onSessionChange } from '../auth.js';
import { go } from '../router.js';
import { openConnectWizard } from '../ui/connect-wizard.js';
import { CONFIG } from '../config.js';
import { tieneCambios, onDraftsChange } from '../drafts.js';
import { abrirDialogoPublicar } from '../publish.js';

const TAREAS = [
  { id: 'info',         label: 'Editar información general', hint: 'Nombre, zona y color',                icon: icons.edit,  route: true },
  { id: 'indicadores',  label: 'Editar indicadores',         hint: 'Los datos que se ven en la ficha',    icon: icons.chart, route: true },
  { id: 'informe',      label: 'Editar informe',             hint: 'Texto completo del relevamiento',     icon: icons.file,  route: true },
  { id: 'imagenes',     label: 'Administrar imágenes',       hint: 'Fotos del barrio y galería',          icon: icons.image, route: false },
  { id: 'mapa',         label: 'Editar mapa',                hint: 'Límites del barrio y puntos de interés', icon: icons.map, route: true },
  { id: 'historial',    label: 'Ver historial',              hint: 'Quién cambió qué y cuándo',           icon: icons.clock, route: true },
  { id: 'preview',      label: 'Vista previa',               hint: 'Cómo se ve en el mapa público',       icon: icons.eye,   route: false }
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

  // Repintar al cambiar sesión o borradores
  const unsub1 = onSessionChange(() => repaint(container, barrio, unsub1, unsub2));
  const unsub2 = onDraftsChange(() => repaint(container, barrio, unsub1, unsub2));
}

function repaint(container, barrio, unsub1, unsub2) {
  if (!document.body.contains(container)) { unsub1(); unsub2(); return; }
  const headSlot    = container.querySelector('.hub-head');
  const tilesSlot   = container.querySelector('.tiles');
  const actionsSlot = container.querySelector('.hub-actions');
  const labelSlot   = container.querySelector('.sec-label');
  if (headSlot)    headSlot.replaceWith(buildHead(barrio));
  if (tilesSlot)   tilesSlot.replaceWith(buildTiles(barrio));
  if (actionsSlot) actionsSlot.replaceWith(buildActions(barrio));
  if (labelSlot)   labelSlot.textContent = canEdit() ? '¿Qué querés hacer?' : 'Acciones disponibles';
}

function buildHead(b) {
  const isDraft = b.estado !== 'publicado';
  // La pill "Con cambios sin publicar" solo aporta información nueva
  // cuando el barrio YA está publicado (isDraft=false) pero tiene
  // cambios locales sin publicar todavía. Si el barrio es un borrador,
  // la pill "Borrador" ya comunica lo mismo — mostrar ambas es redundante.
  const conCambiosSinPublicar = canEdit() && !isDraft && tieneCambios(b.id);

  const subChildren = [
    el('span', { class: `pill ${isDraft ? 'draft' : 'pub'}`, html: `<span class="d"></span>${isDraft ? 'Borrador' : 'Publicado'}` }),
    conCambiosSinPublicar
      ? el('span', { class: 'pill pending', html: '<span class="d"></span>Con cambios sin publicar' })
      : null,
    b.zona ? el('span', { text: b.zona }) : null,
    b.fechaActualizacion
      ? el('span', { text: `Último cambio: ${fechaLarga(b.fechaActualizacion)}` })
      : el('span', { text: 'Aún no se registró una fecha de cambio' })
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
    const isPreview = t.id === 'preview';
    const isHistorial = t.id === 'historial';
    const isReadable = isPreview || isHistorial;
    const disabled = locked && !isReadable;

    // Tareas que aún no tienen editor implementado (todo menos "info" y "preview")
    const notImpl = canEdit() && !t.route && t.id !== 'preview';

    const cls = disabled ? '.tile.locked' : (notImpl ? '.tile.upcoming' : '.tile');

    const tile = el('button' + cls, {
      onClick: () => onTile(t, b, disabled, notImpl),
      title: disabled
        ? 'Conectate para editar'
        : (notImpl ? 'Disponible en un próximo módulo' : t.label),
      disabled: notImpl ? 'disabled' : null,
      'aria-disabled': notImpl ? 'true' : null
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

function onTile(t, b, disabled, notImpl) {
  if (disabled) { openConnectWizard(); return; }
  if (notImpl) return;
  if (t.id === 'preview') { window.open(CONFIG.mapaPublicoUrl, '_blank', 'noopener'); return; }
  if (t.id === 'info') { go(`barrio/${b.id}/info`); return; }
  if (t.id === 'indicadores') { go(`barrio/${b.id}/indicadores`); return; }
  if (t.id === 'informe') { go(`barrio/${b.id}/informe`); return; }
  if (t.id === 'imagenes') { go(`barrio/${b.id}/imagenes`); return; }
  if (t.id === 'mapa') { go(`barrio/${b.id}/mapa`); return; }
  if (t.id === 'historial') { go(`barrio/${b.id}/historial`); return; }
}

function buildActions(b) {
  const row = el('div.hub-actions');

  if (canEdit()) {
    // El botón se habilita en dos casos:
    //  1. Hay cambios registrados en este dispositivo (localStorage).
    //  2. El barrio nunca se publicó (estado 'borrador' viene del propio
    //     index.json, que es información compartida entre dispositivos).
    // Sin el punto 2, si alguien guarda cambios desde su laptop y después
    // abre el panel en el celular, el botón aparece deshabilitado ahí
    // aunque el barrio realmente tenga cambios sin publicar.
    const cambiosLocales = tieneCambios(b.id);
    const nuncaPublicado = b.estado !== 'publicado';
    const conCambios = cambiosLocales || nuncaPublicado;

    const btnPublicar = el('button.btn.primary', {
      onClick: () => abrirDialogoPublicar({ id: b.id, nombreVisible: b.nombreVisible }),
      title: conCambios
        ? (nuncaPublicado && !cambiosLocales
            ? 'Este barrio todavía no se publicó'
            : 'Publicar los cambios pendientes')
        : 'No hay cambios pendientes'
    }, [
      el('span', { html: icons.upload() }).firstChild,
      'Publicar cambios'
    ]);
    if (!conCambios) btnPublicar.disabled = true;

    row.append(
      btnPublicar,
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
