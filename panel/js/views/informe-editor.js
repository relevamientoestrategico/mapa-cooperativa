/**
 * Editor: Informe del barrio.
 *
 * Sigue EXACTAMENTE el patrón estándar (docs/PATRON-EDITOR.md):
 * abrir → detectar cambios → guardar → marcar pendiente → publicar.
 *
 * Qué se edita en este módulo:
 *  - Título y texto de las secciones narrativas (párrafos con **negrita**)
 *  - Agregar / eliminar / reordenar secciones narrativas y sus párrafos
 *  - La conclusión
 *
 * Qué se muestra pero aún no se edita (entidades tipadas, editor futuro):
 *  - KPIs de portada, alertas, tablas, equipo, galería, bloques preservados
 *
 * Al guardar se escriben DOS archivos:
 *  1. data/barrios/{id}/informe.json      (la fuente de verdad)
 *  2. el HTML público del informe          (generado automáticamente)
 */

import { el, toast, manejarErrorGuardado } from '../dom.js';
import { icons } from '../icons.js';
import { fetchFileWithSha, putJsonFile, putTextFile, commitMessage } from '../github.js';
import { canEdit, session, onSessionChange } from '../auth.js';
import { go } from '../router.js';
import { dirty } from '../dirty.js';
import { marcarCambio } from '../drafts.js';
import { openConnectWizard } from '../ui/connect-wizard.js';
import { generarInformeHtml } from '../informe-render.js';
import { abrirEditorGaleria } from './galeria-editor.js';

const NOMBRES_BLOQUE = {
  kpis: 'Datos de portada (KPIs)',
  tablaServicios: 'Tabla de servicios',
  tablaDatos: 'Tabla de datos',
  alerta: 'Alerta destacada',
  equipo: 'Equipo de trabajo',
  galeria: 'Registro fotográfico',
  htmlPreservado: 'Contenido preservado'
};

/**
 * Catálogo canónico de estados para la columna "Estado" de las tablas de
 * servicios. Unifica el color con el significado: hasta ahora la misma
 * etiqueta podía aparecer con clases distintas según el barrio.
 *
 * La clase CSS ('si' | 'parcial' | 'no') es la que define el color en el
 * informe público. La etiqueta es el texto visible.
 */
const ESTADOS_SERVICIO = [
  { clase: 'si',      etiqueta: 'Disponible'   },
  { clase: 'parcial', etiqueta: 'Parcial'      },
  { clase: 'no',      etiqueta: 'Sin servicio' }
];

function escaparHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Extrae { clase, etiqueta } de una celda que contiene un badge HTML. */
function leerBadge(celda) {
  const s = String(celda ?? '');
  const m = s.match(/<span\s+class="badge\s+([^"]*)"\s*>([\s\S]*?)<\/span>/i);
  if (m) return { clase: m[1].trim(), etiqueta: m[2].replace(/<[^>]*>/g, '').trim() };
  return { clase: '', etiqueta: s.replace(/<[^>]*>/g, '').trim() };
}

function armarBadge(clase, etiqueta) {
  return `<span class="badge ${clase}">${escaparHtml(etiqueta)}</span>`;
}

/** ¿La celda ya usa una combinación del catálogo canónico? */
function esCanonico(clase, etiqueta) {
  return ESTADOS_SERVICIO.some(e => e.clase === clase && e.etiqueta === etiqueta);
}

function waitForSessionReady() {
  if (session.status !== 'checking') return Promise.resolve(session.status);
  return new Promise((resolve) => {
    const unsub = onSessionChange((s) => {
      if (s.status !== 'checking') { unsub(); resolve(s.status); }
    });
    setTimeout(() => { unsub(); resolve(session.status); }, 5000);
  });
}

export async function renderInformeEditor(container, { id }) {
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
      el('h1', { text: 'Editar informe' }),
      el('p.sub', { text: 'El texto del relevamiento, sección por sección.' })
    ])
  ]));

  const loading = el('div.loader-row', {}, [el('span.spinner'), 'Cargando el informe…']);
  container.appendChild(loading);

  let informeFile, barrioFile;
  try {
    [informeFile, barrioFile] = await Promise.all([
      fetchFileWithSha(`data/barrios/${id}/informe.json`),
      fetchFileWithSha(`data/barrios/${id}/barrio.json`)
    ]);
  } catch (e) {
    loading.remove();
    container.appendChild(errorBox(e.message));
    return;
  }
  loading.remove();

  if (!informeFile.data || !barrioFile.data) {
    container.appendChild(errorBox('No se encontró el informe de este barrio.'));
    return;
  }

  if (informeFile.data.formato === 'preservado') {
    container.appendChild(el('div.callout.info', {}, [
      el('span', { html: icons.info() }).firstChild,
      el('span', { html: 'Este informe usa un <b>formato anterior</b> del sistema. Se puede ver en el mapa con normalidad, pero todavía no se puede editar por secciones. Su conversión al formato nuevo está prevista para más adelante.' })
    ]));
    return;
  }

  container.appendChild(buildForm(id, informeFile, barrioFile));
}

/* ─── Form ─────────────────────────────────────────────────────── */

function buildForm(id, informeFile, barrioFile) {
  const original = informeFile.data;
  const sha = informeFile.sha;
  const barrio = barrioFile.data;

  // Estado editable: copia profunda de los bloques
  const state = JSON.parse(JSON.stringify(original));
  const initialJson = JSON.stringify(state);

  const dirtyPill = el('span.dirty-pill', {}, [el('span.d'), el('span', { text: 'Cambios sin guardar' })]);
  dirtyPill.style.display = 'none';
  const btnGuardar = el('button.btn.primary', { onClick: () => onSave() }, [
    el('span', { html: icons.check() }).firstChild, 'Guardar'
  ]);
  btnGuardar.disabled = true;

  function isDirty() { return JSON.stringify(state) !== initialJson; }
  function refreshDirty() {
    const changed = isDirty();
    dirtyPill.style.display = changed ? '' : 'none';
    btnGuardar.disabled = !changed;
    btnGuardar.classList.toggle('emphasize', changed);
  }
  dirty.enable(isDirty);

  const bloquesSlot = el('div');

  function pintarBloques() {
    bloquesSlot.innerHTML = '';
    state.bloques.forEach((b, i) => {
      bloquesSlot.appendChild(renderBloque(b, i));
    });
  }

  function moverBloque(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= state.bloques.length) return;
    const [x] = state.bloques.splice(i, 1);
    state.bloques.splice(j, 0, x);
    pintarBloques(); refreshDirty();
  }

  function renderBloque(b, i) {
    if (b.tipo === 'seccion') return renderSeccion(b, i);
    if (b.tipo === 'conclusion') return renderConclusion(b, i);
    if (b.tipo === 'galeria') return renderGaleriaChip(b, i);
    // Entidad tipada sin editor todavía → chip informativo
    const nombre = NOMBRES_BLOQUE[b.tipo] || b.tipo;
    return el('div.blq-chip', {}, [
      el('span.blq-ico', { html: icons.lock() }),
      el('div', {}, [
        el('b', { text: nombre }),
        el('span', { text: 'Se muestra en el informe. Su editor llega en un próximo módulo.' })
      ])
    ]);
  }

  function renderGaleriaChip(b, i) {
    const activas = (b.imagenes || []).filter(im => !im.__eliminar).length;
    const marcadas = (b.imagenes || []).filter(im => im.__eliminar).length;
    const detalle = marcadas
      ? `${activas} fotos activas, ${marcadas} a eliminar`
      : `${activas} foto${activas === 1 ? '' : 's'}`;
    const chip = el('div.blq-chip.blq-chip-clickable', {
      onClick: () => {
        abrirEditorGaleria({
          barrioId: id,
          nombreVisible: barrio.nombreVisible,
          bloque: b,
          onChange: () => { pintarBloques(); refreshDirty(); },
          onClose: () => { pintarBloques(); refreshDirty(); }
        });
      }
    }, [
      el('span.blq-ico', { html: icons.image() }),
      el('div.blq-info', {}, [
        el('b', { text: b.titulo || 'Registro fotográfico' }),
        el('span', { text: detalle + ' — hacé clic para editar' })
      ]),
      el('span.blq-cta', {}, ['Editar'])
    ]);
    return chip;
  }

  /**
   * Editor de tabla de servicios: Servicio · Estado · Detalle.
   * El Estado se edita con un selector del catálogo canónico. Las filas
   * que vienen con etiquetas fuera del catálogo se conservan tal cual y
   * se marcan visualmente; convertirlas es una decisión del usuario.
   */
  function renderTablaServicios(item, cont, k) {
    item.columnas ||= ['Servicio', 'Estado', 'Detalle'];
    item.filas ||= [];

    const wrap = el('div.tbl-editor');

    wrap.appendChild(el('div.tbl-head', {}, [
      el('span.tbl-tipo', { text: 'Tabla de servicios' }),
      el('div.spacer'),
      el('button.del', {
        type: 'button', title: 'Eliminar tabla',
        onClick: () => {
          if (!confirm('¿Eliminar la tabla de servicios completa?')) return;
          cont.splice(k, 1); pintarBloques(); refreshDirty();
        }
      }, ['✕'])
    ]));

    const cabecera = el('div.tbl-row.tbl-row-head', {}, [
      el('span', { text: 'Servicio' }),
      el('span', { text: 'Estado' }),
      el('span', { text: 'Detalle' }),
      el('span', { text: '' })
    ]);
    wrap.appendChild(cabecera);

    item.filas.forEach((fila, fi) => {
      while (fila.length < 3) fila.push('');
      const badge = leerBadge(fila[1]);
      const canonico = esCanonico(badge.clase, badge.etiqueta);

      const inpServicio = el('input.inp', {
        value: fila[0] || '', placeholder: 'Servicio',
        'aria-label': 'Nombre del servicio',
        onInput: (e) => { fila[0] = e.target.value; refreshDirty(); }
      });

      // Selector de estado (define el color)
      const sel = el('select.inp.tbl-estado', {
        'aria-label': 'Estado del servicio',
        onChange: (e) => {
          const opt = ESTADOS_SERVICIO.find(x => x.clase === e.target.value);
          if (opt) {
            fila[1] = armarBadge(opt.clase, inpEtiqueta.value.trim() || opt.etiqueta);
          }
          refreshDirty(); pintarBloques();
        }
      });
      for (const e of ESTADOS_SERVICIO) {
        sel.appendChild(el('option', { value: e.clase, text: e.etiqueta }));
      }
      if (!badge.clase) {
        sel.appendChild(el('option', { value: '', text: '— sin definir —' }));
      }
      sel.value = badge.clase || '';

      // Etiqueta visible (permite conservar matices como "Por mangueras")
      const inpEtiqueta = el('input.inp.tbl-etiqueta', {
        value: badge.etiqueta || '', placeholder: 'Texto visible',
        'aria-label': 'Texto que se muestra en el badge',
        onInput: (e) => {
          fila[1] = armarBadge(sel.value || 'parcial', e.target.value);
          refreshDirty();
        }
      });

      const inpDetalle = el('textarea.inp.tbl-detalle', {
        rows: '2', placeholder: 'Detalle',
        'aria-label': 'Detalle del servicio',
        onInput: (e) => { fila[2] = e.target.value; autoGrow(e.target); refreshDirty(); }
      });
      inpDetalle.value = fila[2] || '';
      requestAnimationFrame(() => autoGrow(inpDetalle));

      const acciones = el('div.tbl-acciones', {}, [
        el('button.mini-btn', {
          type: 'button', title: 'Subir', disabled: fi === 0 ? 'disabled' : null,
          onClick: () => { const [x] = item.filas.splice(fi, 1); item.filas.splice(fi - 1, 0, x); pintarBloques(); refreshDirty(); }
        }, ['↑']),
        el('button.mini-btn', {
          type: 'button', title: 'Bajar', disabled: fi === item.filas.length - 1 ? 'disabled' : null,
          onClick: () => { const [x] = item.filas.splice(fi, 1); item.filas.splice(fi + 1, 0, x); pintarBloques(); refreshDirty(); }
        }, ['↓']),
        el('button.del', {
          type: 'button', title: 'Eliminar fila',
          onClick: () => { item.filas.splice(fi, 1); pintarBloques(); refreshDirty(); }
        }, ['✕'])
      ]);

      const estadoWrap = el('div.tbl-estado-wrap', {}, [sel, inpEtiqueta]);
      if (!canonico && badge.etiqueta) {
        estadoWrap.appendChild(el('span.tbl-aviso', {
          title: 'Esta etiqueta no está en el catálogo estándar. Podés dejarla o elegir una opción del selector.',
          text: 'fuera del estándar'
        }));
      }

      wrap.appendChild(el('div.tbl-row', {}, [inpServicio, estadoWrap, inpDetalle, acciones]));
    });

    if (!item.filas.length) {
      wrap.appendChild(el('div.tbl-vacio', { text: 'La tabla no tiene filas todavía.' }));
    }

    wrap.appendChild(el('button.btn.sm', {
      type: 'button', style: { marginTop: '10px' },
      onClick: () => {
        item.filas.push(['', armarBadge('si', 'Disponible'), '']);
        pintarBloques(); refreshDirty();
      }
    }, [el('span', { html: icons.plus() }).firstChild, 'Agregar fila']));

    return wrap;
  }

  /** Editor de tabla de datos: dos columnas (etiqueta / valor), sin encabezado. */
  function renderTablaDatos(item, cont, k) {
    item.filas ||= [];
    const wrap = el('div.tbl-editor');

    wrap.appendChild(el('div.tbl-head', {}, [
      el('span.tbl-tipo', { text: 'Tabla de datos' }),
      el('div.spacer'),
      el('button.del', {
        type: 'button', title: 'Eliminar tabla',
        onClick: () => {
          if (!confirm('¿Eliminar la tabla de datos completa?')) return;
          cont.splice(k, 1); pintarBloques(); refreshDirty();
        }
      }, ['✕'])
    ]));

    item.filas.forEach((fila, fi) => {
      while (fila.length < 2) fila.push('');

      const inpEtiqueta = el('input.inp', {
        value: fila[0] || '', placeholder: 'Concepto',
        'aria-label': 'Concepto',
        onInput: (e) => { fila[0] = e.target.value; refreshDirty(); }
      });

      const inpValor = el('textarea.inp.tbl-detalle', {
        rows: '2', placeholder: 'Valor o descripción',
        'aria-label': 'Valor',
        onInput: (e) => { fila[1] = e.target.value; autoGrow(e.target); refreshDirty(); }
      });
      inpValor.value = fila[1] || '';
      requestAnimationFrame(() => autoGrow(inpValor));

      const acciones = el('div.tbl-acciones', {}, [
        el('button.mini-btn', {
          type: 'button', title: 'Subir', disabled: fi === 0 ? 'disabled' : null,
          onClick: () => { const [x] = item.filas.splice(fi, 1); item.filas.splice(fi - 1, 0, x); pintarBloques(); refreshDirty(); }
        }, ['↑']),
        el('button.mini-btn', {
          type: 'button', title: 'Bajar', disabled: fi === item.filas.length - 1 ? 'disabled' : null,
          onClick: () => { const [x] = item.filas.splice(fi, 1); item.filas.splice(fi + 1, 0, x); pintarBloques(); refreshDirty(); }
        }, ['↓']),
        el('button.del', {
          type: 'button', title: 'Eliminar fila',
          onClick: () => { item.filas.splice(fi, 1); pintarBloques(); refreshDirty(); }
        }, ['✕'])
      ]);

      wrap.appendChild(el('div.tbl-row.tbl-row-2', {}, [inpEtiqueta, inpValor, acciones]));
    });

    if (!item.filas.length) {
      wrap.appendChild(el('div.tbl-vacio', { text: 'La tabla no tiene filas todavía.' }));
    }

    wrap.appendChild(el('button.btn.sm', {
      type: 'button', style: { marginTop: '10px' },
      onClick: () => { item.filas.push(['', '']); pintarBloques(); refreshDirty(); }
    }, [el('span', { html: icons.plus() }).firstChild, 'Agregar fila']));

    return wrap;
  }

  function renderSeccion(b, i) {
    const card = el('div.sec-card');
    const head = el('div.sec-card-head', {}, [
      el('span.sec-drag', {}, [
        el('button.mini-btn', { type: 'button', title: 'Subir', disabled: i === 0 ? 'disabled' : null, onClick: () => moverBloque(i, -1) }, ['↑']),
        el('button.mini-btn', { type: 'button', title: 'Bajar', disabled: i === state.bloques.length - 1 ? 'disabled' : null, onClick: () => moverBloque(i, 1) }, ['↓'])
      ]),
      el('input.inp.sec-title', {
        value: b.titulo, placeholder: 'Título de la sección',
        onInput: (e) => { b.titulo = e.target.value; refreshDirty(); }
      }),
      el('button.del', {
        type: 'button', title: 'Eliminar sección',
        onClick: () => {
          if (!confirm(`¿Eliminar la sección "${b.titulo}" completa?`)) return;
          state.bloques.splice(i, 1);
          pintarBloques(); refreshDirty();
        }
      }, ['✕'])
    ]);
    card.appendChild(head);

    const body = el('div.sec-card-body');
    b.contenido.forEach((item, k) => {
      if (item.tipo === 'parrafo') {
        const ta = el('textarea.inp.parrafo-ta', {
          rows: '3',
          onInput: (e) => { item.texto = e.target.value; autoGrow(e.target); refreshDirty(); }
        });
        ta.value = item.texto;
        const wrap = el('div.parrafo-wrap', {}, [
          ta,
          el('button.del.parrafo-del', {
            type: 'button', title: 'Eliminar párrafo',
            onClick: () => { b.contenido.splice(k, 1); pintarBloques(); refreshDirty(); }
          }, ['✕'])
        ]);
        body.appendChild(wrap);
        requestAnimationFrame(() => autoGrow(ta));
      } else if (item.tipo === 'tablaServicios') {
        body.appendChild(renderTablaServicios(item, b.contenido, k));
      } else if (item.tipo === 'tablaDatos') {
        body.appendChild(renderTablaDatos(item, b.contenido, k));
      } else {
        const nombre = NOMBRES_BLOQUE[item.tipo] || item.tipo;
        body.appendChild(el('div.item-chip', {}, [
          el('span', { html: icons.lock() }).firstChild,
          el('span', { text: nombre })
        ]));
      }
    });

    body.appendChild(el('div.sec-add-row', {}, [
      el('button.btn.sm', {
        type: 'button',
        onClick: () => {
          b.contenido.push({ tipo: 'parrafo', texto: '' });
          pintarBloques(); refreshDirty();
          const tas = card.querySelectorAll('textarea');
          if (tas.length) tas[tas.length - 1].focus();
        }
      }, [el('span', { html: icons.plus() }).firstChild, 'Agregar párrafo']),

      el('button.btn.sm', {
        type: 'button',
        onClick: () => {
          b.contenido.push({
            tipo: 'tablaServicios',
            columnas: ['Servicio', 'Estado', 'Detalle'],
            filas: [['', armarBadge('si', 'Disponible'), '']]
          });
          pintarBloques(); refreshDirty();
        }
      }, [el('span', { html: icons.plus() }).firstChild, 'Agregar tabla de servicios']),

      el('button.btn.sm', {
        type: 'button',
        onClick: () => {
          b.contenido.push({ tipo: 'tablaDatos', filas: [['', '']] });
          pintarBloques(); refreshDirty();
        }
      }, [el('span', { html: icons.plus() }).firstChild, 'Agregar tabla de datos']),

      el('button.btn.sm', {
        type: 'button',
        onClick: () => {
          // La galería es un bloque de primer nivel (como la sección misma),
          // no un contenido dentro de la sección. Se inserta justo debajo
          // de la sección actual.
          state.bloques.splice(i + 1, 0, {
            id: `blq-gal-${Date.now()}`,
            tipo: 'galeria',
            titulo: `Registro Fotográfico — ${state.encabezado?.titulo || 'Barrio'}`,
            imagenes: []
          });
          pintarBloques(); refreshDirty();
        }
      }, [el('span', { html: icons.plus() }).firstChild, 'Agregar galería'])
    ]));

    card.appendChild(body);
    return card;
  }

  function renderConclusion(b, i) {
    const card = el('div.sec-card.conclusion-card');
    card.appendChild(el('div.sec-card-head', {}, [
      el('span.sec-drag', {}, [
        el('button.mini-btn', { type: 'button', title: 'Subir', disabled: i === 0 ? 'disabled' : null, onClick: () => moverBloque(i, -1) }, ['↑']),
        el('button.mini-btn', { type: 'button', title: 'Bajar', disabled: i === state.bloques.length - 1 ? 'disabled' : null, onClick: () => moverBloque(i, 1) }, ['↓'])
      ]),
      el('input.inp.sec-title', {
        value: b.titulo,
        onInput: (e) => { b.titulo = e.target.value; refreshDirty(); }
      }),
      el('span.pill.pub', { style: { flex: 'none' }, html: '<span class="d"></span>Conclusión' })
    ]));
    const body = el('div.sec-card-body');
    b.parrafos.forEach((p, k) => {
      const ta = el('textarea.inp.parrafo-ta', {
        rows: '3',
        onInput: (e) => { b.parrafos[k] = e.target.value; autoGrow(e.target); refreshDirty(); }
      });
      ta.value = p;
      body.appendChild(el('div.parrafo-wrap', {}, [ta]));
      requestAnimationFrame(() => autoGrow(ta));
    });
    card.appendChild(body);
    return card;
  }

  pintarBloques();

  const btnNuevaSeccion = el('button.btn', {
    type: 'button',
    onClick: () => {
      // insertar antes del bloque equipo/galería si existen; si no, al final
      let pos = state.bloques.length;
      const idxEquipo = state.bloques.findIndex(b => b.tipo === 'equipo' || b.tipo === 'galeria');
      if (idxEquipo !== -1) pos = idxEquipo;
      state.bloques.splice(pos, 0, {
        id: 'blq-' + Date.now().toString(36),
        tipo: 'seccion', icono: '📌', titulo: '', contenido: [{ tipo: 'parrafo', texto: '' }]
      });
      pintarBloques(); refreshDirty();
    }
  }, [el('span', { html: icons.plus() }).firstChild, 'Agregar sección']);

  const ayuda = el('div.callout.info', { style: { marginBottom: '18px' } }, [
    el('span', { html: icons.info() }).firstChild,
    el('span', { html: 'Escribí en texto común. Para <b>negrita</b> encerrá la frase entre dobles asteriscos: <code>**así**</code>. Los bloques con candado (tablas, alertas, fotos) se muestran en el informe pero su editor llega más adelante.' })
  ]);

  const foot = el('div.card.form-card', { style: { marginTop: '16px' } }, [
    el('div.form-foot', { style: { marginTop: '0', paddingTop: '0', borderTop: 'none' } }, [
      dirtyPill,
      el('div.spacer'),
      el('button.btn.ghost', {
        onClick: () => { if (!dirty.confirmNavigate()) return; dirty.disable(); go(`barrio/${id}`); }
      }, ['Cancelar']),
      btnGuardar
    ])
  ]);

  /* ── Guardado: informe.json + HTML regenerado ── */
  async function onSave() {
    for (const b of state.bloques) {
      if (b.tipo === 'seccion' && !String(b.titulo).trim()) {
        toast('Hay una sección sin título. Completalo o eliminala.', 'err');
        return;
      }
    }
    const originalBtn = btnGuardar.innerHTML;
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> Guardando…';

    // Preparar contenido limpio:
    //  - Filtrar imágenes marcadas para eliminar y quitar marcas internas.
    //  - Normalizar párrafos: quitar los completamente vacíos (solo espacios).
    //    Guardar "  " como párrafo genera HTML con un <p> vacío que confunde
    //    al lector. Los párrafos con contenido se preservan tal cual.
    const contenidoParaGuardar = JSON.parse(JSON.stringify(state));
    for (const b of contenidoParaGuardar.bloques) {
      if (b.tipo === 'galeria' && Array.isArray(b.imagenes)) {
        b.imagenes = b.imagenes
          .filter(im => !im.__eliminar)
          .map(im => {
            const clean = { ...im };
            delete clean.__nueva;
            delete clean.__eliminar;
            return clean;
          });
      }
      if ((b.tipo === 'seccion' || b.tipo === 'conclusion') && Array.isArray(b.contenido)) {
        b.contenido = b.contenido
          .filter(c => c.tipo !== 'parrafo' || String(c.texto || '').trim())
          .map(c => c.tipo === 'parrafo' ? { ...c, texto: String(c.texto || '').trimEnd() } : c)
          // Tablas: descartar filas totalmente vacías (una fila recién
          // agregada y no completada no debe llegar al informe público).
          .map(c => {
            const texto = (celda) => String(celda ?? '').replace(/<[^>]*>/g, '').trim();
            if (c.tipo === 'tablaServicios' && Array.isArray(c.filas)) {
              // El badge de Estado siempre tiene un valor por defecto, así que
              // NO cuenta para decidir si la fila tiene contenido: una fila
              // recién agregada y no completada debe descartarse.
              return { ...c, filas: c.filas.filter(f => texto(f?.[0]) || texto(f?.[2])) };
            }
            if (c.tipo === 'tablaDatos' && Array.isArray(c.filas)) {
              return { ...c, filas: c.filas.filter(f => texto(f?.[0]) || texto(f?.[1])) };
            }
            return c;
          })
          // Una tabla sin ninguna fila útil se elimina del informe.
          .filter(c => !((c.tipo === 'tablaServicios' || c.tipo === 'tablaDatos') && !(c.filas || []).length));
      }
      if (b.tipo === 'conclusion' && Array.isArray(b.parrafos)) {
        b.parrafos = b.parrafos
          .filter(p => String(p || '').trim())
          .map(p => String(p).trimEnd());
      }
    }

    try {
      // 1. Guardar la fuente de verdad
      await putJsonFile({
        path: `data/barrios/${id}/informe.json`,
        content: contenidoParaGuardar,
        message: commitMessage(barrio.nombreVisible, 'informe actualizado'),
        sha
      });

      // 2. Regenerar y guardar el HTML público
      const html = generarInformeHtml(contenidoParaGuardar, barrio);
      const htmlPath = barrio.informeUrl;
      let htmlSha = null;
      try {
        const existing = await fetchFileWithSha(htmlPath);
        htmlSha = existing.sha;
      } catch { /* si no existe, se crea */ }
      await putTextFile({
        path: htmlPath,
        text: html,
        message: commitMessage(barrio.nombreVisible, 'informe público regenerado'),
        sha: htmlSha
      });

      marcarCambio(id, { tipo: 'informe', mensaje: 'informe actualizado' });
      dirty.disable();
      toast('Informe guardado. Publicá cuando estés listo.', 'ok');
      go(`barrio/${id}`);
    } catch (e) {
      manejarErrorGuardado(e);
    } finally {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = originalBtn;
    }
  }

  return el('div', {}, [ayuda, bloquesSlot, btnNuevaSeccion, foot]);
}

/* ─── Helpers ─────────────────────────────────────────────────── */

function autoGrow(ta) {
  ta.style.height = 'auto';
  ta.style.height = (ta.scrollHeight + 2) + 'px';
}

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
