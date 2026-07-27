/**
 * Editor: Indicadores del barrio.
 *
 * Sigue EXACTAMENTE el patrón de info-editor (ver docs/PATRON-EDITOR.md):
 * abrir → detectar cambios → guardar → marcar pendiente → publicar.
 *
 * Dos grupos:
 *  - "Datos del mapa": electricidad %, educación, salud. El mapa público
 *    usa estos valores para colorear, filtrar y calcular promedios, así
 *    que existen siempre (se edita el valor, no se pueden eliminar).
 *  - "Ficha del barrio": lista libre de indicadores (etiqueta + valor).
 *    Se pueden agregar, quitar y reordenar. Los 4 originales (edad,
 *    origen, viviendas, material) alimentan lugares fijos del mapa, por
 *    eso muestran una marquita; se pueden editar pero no eliminar.
 */

import { el, toast, manejarErrorGuardado, asociarLabel } from '../dom.js';
import { icons } from '../icons.js';
import { fetchFileWithSha, putJsonFile, commitMessage } from '../github.js';
import { canEdit, session, onSessionChange } from '../auth.js';
import { go } from '../router.js';
import { dirty } from '../dirty.js';
import { marcarCambio } from '../drafts.js';
import { openConnectWizard } from '../ui/connect-wizard.js';

const IDS_MAPA = ['edad', 'origen', 'viviendas', 'material'];

function waitForSessionReady() {
  if (session.status !== 'checking') return Promise.resolve(session.status);
  return new Promise((resolve) => {
    const unsub = onSessionChange((s) => {
      if (s.status !== 'checking') { unsub(); resolve(s.status); }
    });
    setTimeout(() => { unsub(); resolve(session.status); }, 5000);
  });
}

export async function renderIndicadoresEditor(container, { id }) {
  container.innerHTML = '';
  container.appendChild(el('div.loader-row', {}, [el('span.spinner'), 'Cargando…']));
  await waitForSessionReady();

  if (!canEdit()) {
    container.innerHTML = '';
    container.appendChild(guardNoAuth(id));
    return;
  }

  container.innerHTML = '';
  container.appendChild(backLink(id));
  container.appendChild(el('div.page-head', {}, [
    el('div', {}, [
      el('h1', { text: 'Editar indicadores' }),
      el('p.sub', { text: 'Los datos que se muestran en el mapa y en la ficha del barrio.' })
    ])
  ]));

  const loading = el('div.loader-row', {}, [el('span.spinner'), 'Cargando datos del barrio…']);
  container.appendChild(loading);

  let file;
  try {
    file = await fetchFileWithSha(`data/barrios/${id}/barrio.json`);
  } catch (e) {
    loading.remove();
    container.appendChild(errorBox(e.message));
    return;
  }
  if (!file.data) {
    loading.remove();
    container.appendChild(errorBox('No se encontró la información de este barrio.'));
    return;
  }
  loading.remove();
  container.appendChild(buildForm(id, file));
}

/* ─── Form ─────────────────────────────────────────────────────── */

function buildForm(id, file) {
  const original = file.data;
  const sha = file.sha;

  const initial = {
    datosMapa: {
      electricidad: (original.datosMapa || {}).electricidad ?? 0,
      educacion: !!(original.datosMapa || {}).educacion,
      salud: !!(original.datosMapa || {}).salud
    },
    indicadores: (original.indicadores || []).map(i => ({ ...i }))
  };
  const state = JSON.parse(JSON.stringify(initial));

  const dirtyPill = el('span.dirty-pill', {}, [el('span.d'), el('span', { text: 'Cambios sin guardar' })]);
  dirtyPill.style.display = 'none';
  const btnGuardar = el('button.btn.primary', { onClick: () => onSave() }, [
    el('span', { html: icons.check() }).firstChild, 'Guardar'
  ]);
  btnGuardar.disabled = true;

  function isDirty() {
    return JSON.stringify(state) !== JSON.stringify(initial);
  }
  function refreshDirty() {
    const changed = isDirty();
    dirtyPill.style.display = changed ? '' : 'none';
    btnGuardar.disabled = !changed;
    btnGuardar.classList.toggle('emphasize', changed);
  }
  dirty.enable(isDirty);

  /* ── Grupo 1: Datos del mapa ── */
  const inpElec = el('input.inp', {
    type: 'number', min: '0', max: '100', value: String(state.datosMapa.electricidad),
    style: { maxWidth: '120px' },
    onInput: (e) => {
      const v = Math.max(0, Math.min(100, Number(e.target.value) || 0));
      state.datosMapa.electricidad = v;
      refreshDirty();
    }
  });

  function toggle(campo, etiqueta) {
    const btn = el('button.toggle-si-no' + (state.datosMapa[campo] ? '.on' : ''), {
      type: 'button',
      role: 'switch',
      'aria-checked': String(!!state.datosMapa[campo]),
      'aria-label': etiqueta,
      onClick: () => {
        state.datosMapa[campo] = !state.datosMapa[campo];
        btn.classList.toggle('on', state.datosMapa[campo]);
        btn.setAttribute('aria-checked', String(!!state.datosMapa[campo]));
        btn.querySelector('.tx').textContent = state.datosMapa[campo] ? 'Sí' : 'No';
        refreshDirty();
      }
    }, [
      el('span.knob'),
      el('span.tx', { text: state.datosMapa[campo] ? 'Sí' : 'No' })
    ]);
    return el('div.field.inline-field', {}, [el('label', { text: etiqueta }), btn]);
  }

  const labelElec = el('label', { text: 'Conexión eléctrica legal (%)' });
  asociarLabel(labelElec, inpElec);
  const grupoMapa = el('div.card.form-card', { style: { marginBottom: '18px' } }, [
    el('div.callout.info', { style: { marginBottom: '18px' } }, [
      el('span', { html: icons.info() }).firstChild,
      el('span', { text: 'Estos tres datos alimentan los colores, filtros y promedios del mapa público, por eso siempre están presentes.' })
    ]),
    el('div.field', {}, [
      labelElec,
      inpElec,
      el('div.hint', { text: 'Colorea la barra del barrio en el mapa: verde 40% o más, amarillo 15–39%, rojo menos de 15%.' })
    ]),
    toggle('educacion', '¿Tiene acceso a educación en la zona?'),
    toggle('salud', '¿Tiene acceso a salud en la zona?')
  ]);

  /* ── Grupo 2: Ficha libre ── */
  const listaSlot = el('div');

  function pintarLista() {
    listaSlot.innerHTML = '';
    state.indicadores.forEach((ind, i) => {
      const esBase = IDS_MAPA.includes(ind.id);
      const row = el('div.ind-row', {}, [
        el('button.mini-btn', {
          type: 'button', title: 'Subir', 'aria-label': `Subir ${ind.etiqueta || 'indicador'}`, disabled: i === 0 ? 'disabled' : null,
          onClick: () => { const [x] = state.indicadores.splice(i, 1); state.indicadores.splice(i - 1, 0, x); pintarLista(); refreshDirty(); }
        }, ['↑']),
        el('button.mini-btn', {
          type: 'button', title: 'Bajar', 'aria-label': `Bajar ${ind.etiqueta || 'indicador'}`, disabled: i === state.indicadores.length - 1 ? 'disabled' : null,
          onClick: () => { const [x] = state.indicadores.splice(i, 1); state.indicadores.splice(i + 1, 0, x); pintarLista(); refreshDirty(); }
        }, ['↓']),
        el('input.inp.etq', {
          value: ind.etiqueta, placeholder: 'Nombre del indicador',
          'aria-label': 'Nombre del indicador',
          disabled: esBase ? 'disabled' : null,
          title: esBase ? 'Este indicador se muestra en un lugar fijo del mapa; su nombre no se cambia.' : null,
          onInput: (e) => { ind.etiqueta = e.target.value; refreshDirty(); }
        }),
        el('input.inp.val', {
          value: String(ind.valor ?? ''), placeholder: 'Valor',
          'aria-label': ind.etiqueta ? `Valor de ${ind.etiqueta}` : 'Valor del indicador',
          onInput: (e) => { ind.valor = e.target.value; refreshDirty(); }
        }),
        esBase
          ? el('span.map-mark', { title: 'Se muestra en el mapa', html: icons.map() })
          : el('button.del', {
              type: 'button', title: 'Eliminar', 'aria-label': `Eliminar ${ind.etiqueta || 'indicador'}`,
              onClick: () => { state.indicadores.splice(i, 1); pintarLista(); refreshDirty(); }
            }, ['✕'])
      ]);
      listaSlot.appendChild(row);
    });
  }
  pintarLista();

  const btnAgregar = el('button.btn.sm', {
    type: 'button',
    onClick: () => {
      state.indicadores.push({ id: 'ind-' + Date.now().toString(36), etiqueta: '', valor: '' });
      pintarLista(); refreshDirty();
      const inputs = listaSlot.querySelectorAll('.ind-row:last-child input');
      if (inputs[0]) inputs[0].focus();
    }
  }, [el('span', { html: icons.plus() }).firstChild, 'Agregar indicador']);

  const grupoFicha = el('div.card.form-card', {}, [
    el('p.sec-label', { style: { marginBottom: '14px' }, text: 'Ficha del barrio' }),
    listaSlot,
    el('div', { style: { marginTop: '14px' } }, [btnAgregar]),

    el('div.form-foot', {}, [
      dirtyPill,
      el('div.spacer'),
      el('button.btn.ghost', {
        onClick: () => { if (!dirty.confirmNavigate()) return; dirty.disable(); go(`barrio/${id}`); }
      }, ['Cancelar']),
      btnGuardar
    ])
  ]);

  /* ── Guardado (patrón estándar) ── */
  async function onSave() {
    // Validación: sin etiquetas vacías
    for (const ind of state.indicadores) {
      if (!String(ind.etiqueta).trim()) {
        toast('Hay un indicador sin nombre. Completalo o eliminalo.', 'err');
        return;
      }
    }
    // Revalidar electricidad (el input puede tener valor fuera de rango si
    // el usuario escribió sin pausa antes de que el evento onInput clampeara)
    const elecFinal = Math.max(0, Math.min(100, Number(state.datosMapa.electricidad) || 0));
    state.datosMapa.electricidad = elecFinal;
    // Límite de longitud en valores de indicadores (200 chars es más que suficiente
    // para cualquier valor real del relevamiento)
    const MAX_VALOR = 200;
    for (const ind of state.indicadores) {
      if (String(ind.valor || '').length > MAX_VALOR) {
        toast(`El valor de "${ind.etiqueta}" es demasiado largo. Máximo ${MAX_VALOR} caracteres.`, 'err');
        return;
      }
    }
    const originalBtn = btnGuardar.innerHTML;
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> Guardando…';

    const updated = {
      ...original,
      datosMapa: { ...state.datosMapa },
      indicadores: state.indicadores.map(i => ({ ...i, etiqueta: String(i.etiqueta).trim() }))
    };

    try {
      await putJsonFile({
        path: `data/barrios/${id}/barrio.json`,
        content: updated,
        message: commitMessage(original.nombreVisible, 'indicadores actualizados'),
        sha
      });
      marcarCambio(id, { tipo: 'indicadores', mensaje: 'indicadores actualizados' });
      dirty.disable();
      toast('Cambios guardados. Publicá cuando estés listo.', 'ok');
      go(`barrio/${id}`);
    } catch (e) {
      manejarErrorGuardado(e);
    } finally {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = originalBtn;
    }
  }

  return el('div', {}, [grupoMapa, grupoFicha]);
}

/* ─── Helpers compartidos del patrón ──────────────────────────── */

function backLink(id) {
  return el('a.back-link', {
    onClick: (e) => {
      e.preventDefault();
      if (!dirty.confirmNavigate()) return;
      dirty.disable();
      go(`barrio/${id}`);
    },
    href: `#/barrio/${id}`
  }, [el('span', { html: icons.chevronLeft() }).firstChild, 'Volver al barrio']);
}

function guardNoAuth(id) {
  return el('div', {}, [
    el('a.back-link', { href: `#/barrio/${id}`, onClick: (e) => { e.preventDefault(); go(`barrio/${id}`); } },
      [el('span', { html: icons.chevronLeft() }).firstChild, 'Volver al barrio']),
    el('div.callout.warn', {}, [
      el('span', { html: icons.lock() }).firstChild,
      el('span', { html: 'Necesitás <b>conectar tu clave de acceso</b> para editar este barrio.' })
    ]),
    el('div', { style: { marginTop: '16px' } }, [
      el('button.btn.primary', { onClick: openConnectWizard }, [
        el('span', { html: icons.key() }).firstChild, 'Conectar'
      ])
    ])
  ]);
}

function errorBox(msg) {
  return el('div.callout.error', {}, [
    el('span', { html: icons.alert() }).firstChild,
    el('span', { text: msg })
  ]);
}
