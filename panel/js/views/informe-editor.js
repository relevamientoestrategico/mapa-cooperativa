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
      } else {
        const nombre = NOMBRES_BLOQUE[item.tipo] || item.tipo;
        body.appendChild(el('div.item-chip', {}, [
          el('span', { html: icons.lock() }).firstChild,
          el('span', { text: nombre })
        ]));
      }
    });

    body.appendChild(el('button.btn.sm', {
      type: 'button', style: { marginTop: '8px' },
      onClick: () => {
        b.contenido.push({ tipo: 'parrafo', texto: '' });
        pintarBloques(); refreshDirty();
        const tas = card.querySelectorAll('textarea');
        if (tas.length) tas[tas.length - 1].focus();
      }
    }, [el('span', { html: icons.plus() }).firstChild, 'Agregar párrafo']));

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
          .map(c => c.tipo === 'parrafo' ? { ...c, texto: String(c.texto || '').trimEnd() } : c);
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
      const html = generarInformeHtml(contenidoParaGuardar);
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
