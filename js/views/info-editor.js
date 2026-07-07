/**
 * Editor: Información general del barrio.
 *
 * Primera vista que ESCRIBE al repo (Módulo 3). Los editores futuros
 * (indicadores, informe, imágenes, límites, puntos) heredan este patrón:
 *
 *   1. fetchFileWithSha  → leo el archivo y guardo su SHA
 *   2. render form       → muestro los campos editables
 *   3. dirty tracking    → aviso si el usuario intenta salir sin guardar
 *   4. putJsonFile       → guardo con el SHA para detectar conflictos
 *   5. marcarCambio      → registro que el barrio tiene cambios pendientes
 *   6. estados visuales  → "Guardando…" / "Guardado ✓" / errores claros
 */

import { el, toast, fechaLarga } from '../dom.js';
import { icons } from '../icons.js';
import { fetchFileWithSha, putJsonFile, commitMessage } from '../github.js';
import { canEdit, session, onSessionChange } from '../auth.js';
import { go } from '../router.js';
import { dirty } from '../dirty.js';
import { marcarCambio } from '../drafts.js';
import { openConnectWizard } from '../ui/connect-wizard.js';

const PALETA = [
  '#0C8A5A', '#1e6fa8', '#c8a800', '#b34000', '#7b2d8b',
  '#c04a00', '#2f8f6f', '#a05a2c', '#4a6b3d', '#d4711f'
];

/**
 * Espera a que la sesión termine de verificarse (estado != 'checking').
 * Resuelve con el estado final.
 */
function waitForSessionReady() {
  if (session.status !== 'checking') return Promise.resolve(session.status);
  return new Promise((resolve) => {
    const unsub = onSessionChange((s) => {
      if (s.status !== 'checking') { unsub(); resolve(s.status); }
    });
    // Timeout de seguridad: 5 segundos
    setTimeout(() => { unsub(); resolve(session.status); }, 5000);
  });
}

export async function renderInfoEditor(container, { id }) {
  container.innerHTML = '';

  // Loader mientras se verifica la sesión
  const loading = el('div.loader-row', {}, [
    el('span.spinner'), 'Cargando…'
  ]);
  container.appendChild(loading);

  await waitForSessionReady();

  // Guardia: sin conexión, no entra al editor
  if (!canEdit()) {
    container.innerHTML = '';
    container.appendChild(el('a.back-link', {
      onClick: (e) => { e.preventDefault(); go(`barrio/${id}`); },
      href: `#/barrio/${id}`
    }, [
      el('span', { html: icons.chevronLeft() }).firstChild,
      'Volver al barrio'
    ]));
    container.appendChild(el('div.callout.warn', {}, [
      el('span', { html: icons.lock() }).firstChild,
      el('span', { html: 'Necesitás <b>conectar tu clave de acceso</b> para editar este barrio.' })
    ]));
    container.appendChild(el('div', { style: { marginTop: '16px' } }, [
      el('button.btn.primary', { onClick: openConnectWizard }, [
        el('span', { html: icons.key() }).firstChild,
        'Conectar'
      ])
    ]));
    return;
  }

  // Volver al hub con confirmación si hay cambios sin guardar
  container.innerHTML = '';

  const backLink = el('a.back-link', {
    onClick: (e) => {
      e.preventDefault();
      if (!dirty.confirmNavigate()) return;
      dirty.disable();
      go(`barrio/${id}`);
    },
    href: `#/barrio/${id}`
  }, [
    el('span', { html: icons.chevronLeft() }).firstChild,
    'Volver al barrio'
  ]);
  container.appendChild(backLink);

  container.appendChild(el('div.page-head', {}, [
    el('div', {}, [
      el('h1', { text: 'Editar información general' }),
      el('p.sub', { text: 'Nombre visible, zona y color del barrio.' })
    ])
  ]));

  const loadingData = el('div.loader-row', {}, [
    el('span.spinner'), 'Cargando datos del barrio…'
  ]);
  container.appendChild(loadingData);

  // Traemos el archivo con su SHA (necesario para detectar conflictos al guardar)
  const path = `data/barrios/${id}/barrio.json`;
  let file;
  try {
    file = await fetchFileWithSha(path);
  } catch (e) {
    loadingData.remove();
    container.appendChild(errorBox(e.message));
    return;
  }
  if (!file.data) {
    loadingData.remove();
    container.appendChild(errorBox('No se encontró la información de este barrio.'));
    return;
  }

  loadingData.remove();
  container.appendChild(buildForm(id, file));
}

/* ─── Form ──────────────────────────────────────────────────────── */

function buildForm(id, file) {
  const original = file.data;
  const sha = file.sha;

  // Snapshot inicial para poder comparar y decidir si hay cambios
  const initial = {
    nombreVisible: original.nombreVisible || '',
    zona: original.zona || '',
    color: original.color || PALETA[0]
  };
  const state = { ...initial };

  // Refs
  const dirtyPill = el('span.dirty-pill', {}, [
    el('span.d'),
    el('span', { text: 'Cambios sin guardar' })
  ]);
  dirtyPill.style.display = 'none';

  const btnGuardar = el('button.btn.primary', {
    onClick: () => onSave()
  }, [
    el('span', { html: icons.check() }).firstChild,
    'Guardar'
  ]);
  btnGuardar.disabled = true;   // arranca deshabilitado (no hay cambios aún)

  function refreshDirty() {
    const changed = state.nombreVisible !== initial.nombreVisible
                 || state.zona          !== initial.zona
                 || state.color         !== initial.color;
    dirtyPill.style.display = changed ? '' : 'none';
    btnGuardar.disabled = !changed;
    btnGuardar.classList.toggle('emphasize', changed);
  }

  // Activar el guardián de "cambios sin guardar" al vuelo
  dirty.enable(() => (
    state.nombreVisible !== initial.nombreVisible ||
    state.zona          !== initial.zona ||
    state.color         !== initial.color
  ));

  // ─ Inputs ─
  const inpNombre = el('input.inp', {
    type: 'text',
    value: state.nombreVisible,
    maxlength: '80',
    onInput: (e) => { state.nombreVisible = e.target.value; refreshDirty(); }
  });
  const inpZona = el('input.inp', {
    type: 'text',
    value: state.zona,
    maxlength: '80',
    placeholder: 'Ej: Zona Sur Oeste',
    onInput: (e) => { state.zona = e.target.value; refreshDirty(); }
  });

  const swatches = el('div.swatches');
  for (const c of PALETA) {
    const s = el('button' + (c === state.color ? '.sw.on' : '.sw'), {
      type: 'button',
      style: { background: c },
      title: c,
      'aria-label': `Color ${c}`,
      onClick: (e) => {
        e.preventDefault();
        state.color = c;
        swatches.querySelectorAll('.sw').forEach(x => x.classList.remove('on'));
        e.currentTarget.classList.add('on');
        refreshDirty();
      }
    });
    swatches.appendChild(s);
  }

  const form = el('div.card.form-card', {}, [
    el('div.field', {}, [
      el('label', { for: 'inp-nombre', text: 'Nombre visible' }),
      inpNombre,
      el('div.hint', { text: 'Podés cambiarlo cuando quieras. No afecta el identificador interno ni el historial.' })
    ]),
    el('div.field', {}, [
      el('label', { for: 'inp-zona', text: 'Zona' }),
      inpZona
    ]),
    el('div.field', {}, [
      el('label', { text: 'Color en el mapa' }),
      swatches
    ]),

    el('div.form-foot', {}, [
      dirtyPill,
      el('div.spacer'),
      el('button.btn.ghost', {
        onClick: () => {
          if (!dirty.confirmNavigate()) return;
          dirty.disable();
          go(`barrio/${id}`);
        }
      }, ['Cancelar']),
      btnGuardar
    ])
  ]);

  refreshDirty();

  /* ─── Guardado ────────────────────────────────────────────── */

  async function onSave() {
    // Validación mínima local
    const nombre = state.nombreVisible.trim();
    if (!nombre) {
      inpNombre.focus();
      toast('El nombre no puede quedar vacío.', 'err');
      return;
    }

    // Estado UI: guardando
    const originalBtn = btnGuardar.innerHTML;
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> Guardando…';

    // Copia el objeto original y modifica solo los campos que este editor toca
    // (así preservamos indicadores, informeUrl, versionActual, etc.)
    const updated = {
      ...original,
      nombreVisible: nombre,
      zona: state.zona.trim(),
      color: state.color
    };

    try {
      const msg = commitMessage(nombre, 'información general actualizada');
      await putJsonFile({
        path: `data/barrios/${id}/barrio.json`,
        content: updated,
        message: msg,
        sha
      });

      // Si además cambió nombre o color, el índice queda desactualizado.
      // Lo actualizamos también, en un segundo commit.
      const nombreCambio = updated.nombreVisible !== original.nombreVisible;
      const colorCambio  = updated.color         !== original.color;
      if (nombreCambio || colorCambio) {
        try { await sincronizarIndice(id, updated); }
        catch (e) {
          // Si falla la sync del índice, el barrio.json sí se guardó,
          // pero avisamos al usuario para que reintente publicar.
          console.warn('Índice desincronizado:', e);
          toast('Se guardó el barrio, pero no pudimos actualizar la lista. Reintentá en un momento.', 'err');
        }
      }

      marcarCambio(id, { tipo: 'info', mensaje: 'información general actualizada' });
      dirty.disable();
      toast('Cambios guardados. Publicá cuando estés listo.', 'ok');
      go(`barrio/${id}`);
    } catch (e) {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = originalBtn;

      if (e.code === 'conflict') {
        showConflictModal();
      } else if (e.code === 'unauthorized') {
        toast('Tu clave de acceso ya no es válida. Reconectate.', 'err');
        setTimeout(openConnectWizard, 500);
      } else {
        toast(e.message || 'No se pudo guardar. Probá de nuevo.', 'err');
      }
    }
  }

  return form;
}

/* ─── Índice: mantener nombre/color sincronizados ─────────────── */

async function sincronizarIndice(id, updated) {
  const path = 'data/barrios/index.json';
  const file = await fetchFileWithSha(path);
  const idx = file.data;
  const entry = (idx.barrios || []).find(b => b.id === id);
  if (!entry) return;

  const cambios = {};
  if (entry.nombreVisible !== updated.nombreVisible) cambios.nombreVisible = updated.nombreVisible;
  if (entry.color         !== updated.color)         cambios.color         = updated.color;
  if (Object.keys(cambios).length === 0) return;

  Object.assign(entry, cambios);
  await putJsonFile({
    path,
    content: idx,
    message: commitMessage(updated.nombreVisible, 'lista de barrios actualizada'),
    sha: file.sha
  });
}

/* ─── Modal de conflicto ──────────────────────────────────────── */

function showConflictModal() {
  import('../dom.js').then(({ openModal }) => {
    const close = openModal({
      title: 'Otra persona editó este barrio',
      body: el('div', {}, [
        el('p', { style: { fontSize: '13.5px', lineHeight: '1.6', color: 'var(--text-2)' },
          text: 'Mientras estabas trabajando, alguien más guardó cambios en este barrio. Para no pisar su trabajo, refrescá para ver los cambios más recientes y volvé a intentarlo.'
        })
      ]),
      footer: [
        el('button.btn.primary', {
          onClick: () => { close.close('reload'); location.reload(); }
        }, ['Refrescar y ver los cambios'])
      ]
    });
  });
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function errorBox(msg) {
  return el('div.callout.error', {}, [
    el('span', { html: icons.alert() }).firstChild,
    el('span', { text: msg })
  ]);
}
