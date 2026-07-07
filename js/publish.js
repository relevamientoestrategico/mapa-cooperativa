/**
 * Flujo de Publicar cambios.
 *
 * En el Módulo 3, los archivos ya se escriben al repo en cada Guardar
 * (los cambios están "vivos" en el repo). Publicar, en esta etapa, es
 * la acción editorial que:
 *
 *   1. Actualiza `fechaActualizacion` en el barrio.json
 *   2. Marca el estado como 'publicado' (por si estaba en borrador)
 *   3. Refresca el mismo campo en el índice
 *   4. Limpia los cambios pendientes del barrio
 *
 * En el Módulo 6 (versionado) además crea un snapshot en /versiones/.
 * La firma de publicarBarrio() no cambia; solo se enriquece por dentro.
 */

import { el, openModal, toast, fechaLarga } from './dom.js';
import { icons } from './icons.js';
import { fetchFileWithSha, putJsonFile, commitMessage } from './github.js';
import { limpiarCambios, cambiosDe } from './drafts.js';

/**
 * Abre un diálogo de confirmación y, si el usuario confirma, publica.
 * Devuelve una Promise que resuelve `true` si se publicó, `false` si canceló.
 *
 * @param {object} barrio  { id, nombreVisible }
 */
export function abrirDialogoPublicar(barrio) {
  return new Promise((resolve) => {
    const pendientes = cambiosDe(barrio.id);

    const listaCambios = pendientes.length
      ? el('ul', { style: { listStyle: 'none', padding: 0, margin: '12px 0 0' } },
          pendientes.map(c => el('li', {
            style: { padding: '9px 12px', borderRadius: '8px', background: 'var(--canvas)', marginBottom: '6px', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '9px' }
          }, [
            el('span', { html: `<svg class="ico" viewBox="0 0 24 24" style="color:var(--accent);width:14px;height:14px"><path d="M20 6 9 17l-5-5" fill="none" stroke="currentColor" stroke-width="2.5"/></svg>` }).firstChild,
            el('span', { text: c.mensaje })
          ])))
      : el('p', { style: { fontSize: '13px', color: 'var(--text-2)' },
          text: 'No hay cambios pendientes para publicar.' });

    const body = el('div', {}, [
      el('p', { style: { fontSize: '13.5px', color: 'var(--text-2)', lineHeight: '1.55' },
        text: pendientes.length
          ? 'Al publicar, estos cambios pasan a ser visibles como la información actual del barrio.'
          : 'Este barrio no tiene cambios pendientes de publicar.'
      }),
      listaCambios
    ]);

    const btnConfirm = el('button.btn.primary', {
      onClick: () => publicarAhora(barrio, close, resolve)
    }, [
      el('span', { html: icons.upload() }).firstChild,
      'Publicar cambios'
    ]);
    if (!pendientes.length) btnConfirm.disabled = true;

    const close = openModal({
      title: `Publicar cambios de ${barrio.nombreVisible}`,
      body,
      footer: [
        el('button.btn.ghost', { onClick: () => { close.close('cancel'); resolve(false); } }, ['Cancelar']),
        btnConfirm
      ]
    });
  });
}

/* ─── Publicar de verdad ────────────────────────────────────── */

async function publicarAhora(barrio, close, resolve) {
  const modalFoot = document.querySelector('.modal-foot');
  const btn = modalFoot?.querySelector('.btn.primary');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> Publicando…';
  }

  try {
    // 1. Barrio: fecha + estado
    const file = await fetchFileWithSha(`data/barrios/${barrio.id}/barrio.json`);
    const data = file.data || {};
    data.fechaActualizacion = new Date().toISOString();
    data.estado = 'publicado';

    await putJsonFile({
      path: `data/barrios/${barrio.id}/barrio.json`,
      content: data,
      message: commitMessage(barrio.nombreVisible, 'cambios publicados'),
      sha: file.sha
    });

    // 2. Índice: reflejar el estado
    const idxFile = await fetchFileWithSha('data/barrios/index.json');
    const idx = idxFile.data;
    const entry = (idx.barrios || []).find(b => b.id === barrio.id);
    if (entry && entry.estado !== 'publicado') {
      entry.estado = 'publicado';
      await putJsonFile({
        path: 'data/barrios/index.json',
        content: idx,
        message: commitMessage(barrio.nombreVisible, 'estado actualizado a publicado'),
        sha: idxFile.sha
      });
    }

    // 3. Limpiar el estado local de cambios pendientes
    limpiarCambios(barrio.id);

    close.close('published');
    toast('Publicado. Los cambios ya están en el mapa (puede tardar 1-2 minutos en verse).', 'ok');
    resolve(true);
  } catch (e) {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" style="width:16px;height:16px"><path d="M12 19V5M5 12l7-7 7 7" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg> Publicar cambios';
    }
    if (e.code === 'conflict') {
      toast('Otra persona editó este barrio mientras tanto. Refrescá antes de publicar.', 'err');
    } else if (e.code === 'unauthorized') {
      toast('Tu clave de acceso ya no es válida. Reconectate.', 'err');
    } else {
      toast(e.message || 'No se pudo publicar. Probá de nuevo.', 'err');
    }
  }
}
