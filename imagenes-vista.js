/**
 * Vista: Administrar imágenes de un barrio.
 *
 * Vista standalone (accesible desde el hub como tile) que permite ver,
 * subir, reordenar y eliminar las fotos de las galerías del barrio.
 *
 * Las imágenes viven dentro de bloques de tipo "galeria" en informe.json.
 * Esta vista carga el informe, extrae las galerías, y permite editarlas
 * sin tener que navegar el informe completo.
 *
 * Patrón: fetchFileWithSha → render → dirty → putJsonFile → marcarCambio
 * (igual que los demás editores).
 */

import { el, toast, manejarErrorGuardado, asociarLabel } from '../dom.js';
import { icons } from '../icons.js';
import { fetchFileWithSha, putJsonFile, putBinaryFile, fileExists, commitMessage } from '../github.js';
import { canEdit } from '../auth.js';
import { go } from '../router.js';
import { dirty } from '../dirty.js';
import { marcarCambio } from '../drafts.js';
import { marcarArchivoParaEliminar, desmarcarArchivo } from '../drafts.js';
import { procesarImagen, formatearPeso } from '../image-pipeline.js';
import { CONFIG } from '../config.js';

const RAW_BASE = `https://raw.githubusercontent.com/${CONFIG.repo.owner}/${CONFIG.repo.name}/${CONFIG.repo.branch}`;

/**
 * Convierte un src almacenado en informe.json a una URL para mostrar.
 * Soporta los dos formatos que existen en el sistema:
 *   - "data/barrios/.../xxx.jpg"  (path completo relativo al repo)
 *   - "archivo.jpg"              (solo nombre, barrios legacy)
 */
function resolverSrc(src, barrioId) {
  if (!src) return '';
  if (src.startsWith('http')) return src;
  if (src.startsWith('data/')) return `${RAW_BASE}/${src}`;
  // Legacy: solo nombre de archivo, asumimos que está en la galería del barrio
  return `${RAW_BASE}/data/barrios/${barrioId}/adjuntos/galeria/${src}`;
}

export async function renderImagenesVista(container, { id }) {
  container.innerHTML = '';

  container.appendChild(el('a.back-link', {
    onClick: (e) => { e.preventDefault(); if (!dirty.confirmNavigate()) return; dirty.disable(); go(`barrio/${id}`); },
    href: `#/barrio/${id}`
  }, [
    el('span', { html: icons.chevronLeft() }).firstChild,
    'Volver al barrio'
  ]));

  const loading = el('div.loader-row', {}, [el('span.spinner'), 'Cargando imágenes…']);
  container.appendChild(loading);

  // ── Carga de datos ────────────────────────────────────────
  let informeData, informeSha, barrio;
  try {
    const [informeFile, barrioFile] = await Promise.all([
      fetchFileWithSha(`data/barrios/${id}/informe.json`),
      fetchFileWithSha(`data/barrios/${id}/barrio.json`)
    ]);
    informeData = JSON.parse(informeFile.decoded);
    informeSha = informeFile.sha;
    barrio = JSON.parse(barrioFile.decoded);
  } catch (err) {
    loading.remove();
    container.appendChild(el('div.empty-state', {}, [
      el('p', { text: 'No se pudo cargar el informe de este barrio.' }),
      el('p.sub', { text: err.message || 'Error desconocido.' })
    ]));
    return;
  }

  loading.remove();

  // ── Extraer galerías del informe ──────────────────────────
  const galerias = (informeData.bloques || []).filter(b => b.tipo === 'galeria');

  // Snapshot para dirty checking
  const snapshotInicial = JSON.stringify(galerias.map(g => ({
    titulo: g.titulo,
    imagenes: (g.imagenes || []).filter(i => !i.__eliminar).map(i => i.id || i.src)
  })));

  dirty.enable(false);

  function checkDirty() {
    const actual = JSON.stringify(galerias.map(g => ({
      titulo: g.titulo,
      imagenes: (g.imagenes || []).filter(i => !i.__eliminar).map(i => i.id || i.src)
    })));
    const cambiado = actual !== snapshotInicial;
    dirty.enable(cambiado);
    return cambiado;
  }

  // ── Header ────────────────────────────────────────────────
  const nombreVisible = barrio.nombreVisible || id;
  container.appendChild(el('h1', { text: `Imágenes de ${nombreVisible}` }));

  if (!galerias.length) {
    container.appendChild(el('div.callout.info', {}, [
      el('span', { html: icons.info() }).firstChild,
      el('span', { text: 'Este barrio todavía no tiene galerías de fotos. Las galerías se crean desde el editor de informe, agregando un bloque de tipo "Galería". Una vez que exista al menos una, acá vas a poder administrar las fotos.' })
    ]));
    return;
  }

  // ── Render de cada galería ────────────────────────────────
  const galeriasContainer = el('div.img-galerias');
  container.appendChild(galeriasContainer);

  function pintarTodo() {
    galeriasContainer.innerHTML = '';
    galerias.forEach((gal, gi) => {
      galeriasContainer.appendChild(renderGaleria(gal, gi));
    });
  }

  function renderGaleria(gal, gi) {
    gal.imagenes ||= [];
    const seccion = el('div.img-seccion');

    // Título de la galería
    const labelTitulo = el('label', { text: 'Título de la galería' });
    const inpTitulo = el('input.inp', {
      value: gal.titulo || '',
      placeholder: 'Título de la galería',
      onInput: (e) => { gal.titulo = e.target.value; checkDirty(); }
    });
    asociarLabel(labelTitulo, inpTitulo);
    seccion.appendChild(el('div.img-titulo-wrap', {}, [
      el('h3', { text: gal.titulo || `Galería ${gi + 1}` }),
      el('span.img-count', { text: `${gal.imagenes.filter(i => !i.__eliminar).length} foto(s)` })
    ]));

    // Grid de fotos
    const grid = el('div.img-grid');
    const visibles = gal.imagenes.filter(i => !i.__eliminar);
    const eliminadas = gal.imagenes.filter(i => i.__eliminar);

    if (!visibles.length && !eliminadas.length) {
      grid.appendChild(el('div.img-empty', { text: 'Sin fotos en esta galería.' }));
    }

    gal.imagenes.forEach((img, i) => {
      const marcada = img.__eliminar === true;
      const card = el('div.img-card' + (marcada ? '.marcada' : ''));

      const imgUrl = img.__blobUrl || resolverSrc(img.src, id);
      const thumb = el('div.img-thumb');
      if (imgUrl) {
        thumb.appendChild(el('img', { src: imgUrl, alt: img.alt || '', loading: 'lazy' }));
      }
      if (marcada) {
        thumb.appendChild(el('div.img-overlay', { text: 'Se eliminará al publicar' }));
      }
      card.appendChild(thumb);

      // Acciones
      const acciones = el('div.img-acciones');
      if (!marcada) {
        if (i > 0) {
          const prev = gal.imagenes.slice(0, i).findLastIndex(x => !x.__eliminar);
          if (prev >= 0) {
            acciones.appendChild(el('button.mini-btn', {
              type: 'button', title: 'Mover atrás', 'aria-label': 'Mover foto hacia atrás',
              onClick: () => { const [x] = gal.imagenes.splice(i, 1); gal.imagenes.splice(prev, 0, x); checkDirty(); pintarTodo(); }
            }, ['←']));
          }
        }
        if (i < gal.imagenes.length - 1) {
          const next = gal.imagenes.slice(i + 1).findIndex(x => !x.__eliminar);
          if (next >= 0) {
            acciones.appendChild(el('button.mini-btn', {
              type: 'button', title: 'Mover adelante', 'aria-label': 'Mover foto hacia adelante',
              onClick: () => { const ni = i + 1 + next; const [x] = gal.imagenes.splice(i, 1); gal.imagenes.splice(ni, 0, x); checkDirty(); pintarTodo(); }
            }, ['→']));
          }
        }
        acciones.appendChild(el('div.spacer'));
        acciones.appendChild(el('button.mini-btn.danger', {
          type: 'button', title: 'Eliminar', 'aria-label': 'Eliminar foto',
          onClick: () => {
            img.__eliminar = true;
            if (!img.__nueva && img.src) marcarArchivoParaEliminar(id, img.src);
            checkDirty(); pintarTodo();
          }
        }, ['✕']));
      } else {
        acciones.appendChild(el('button.mini-btn.restore', {
          type: 'button', title: 'Deshacer', 'aria-label': 'Restaurar foto',
          onClick: () => {
            img.__eliminar = false;
            if (!img.__nueva && img.src) desmarcarArchivo(id, img.src);
            checkDirty(); pintarTodo();
          }
        }, ['↩']));
      }
      card.appendChild(acciones);

      // Caption
      if (!marcada) {
        card.appendChild(el('input.inp.img-caption', {
          value: img.caption || img.alt || '',
          placeholder: 'Descripción',
          'aria-label': 'Descripción de la foto',
          onInput: (e) => { img.caption = e.target.value; img.alt = e.target.value; checkDirty(); }
        }));
      }

      grid.appendChild(card);
    });

    seccion.appendChild(grid);

    // Zona de subida
    if (canEdit()) {
      const inputFile = el('input', {
        type: 'file', accept: 'image/*', multiple: 'multiple',
        style: { display: 'none' },
        onChange: (e) => { manejarArchivos(e.target.files, gal); inputFile.value = ''; }
      });
      const dropzone = el('div.img-dropzone', {
        onClick: () => inputFile.click(),
        onDragOver: (e) => { e.preventDefault(); dropzone.classList.add('over'); },
        onDragLeave: () => dropzone.classList.remove('over'),
        onDrop: (e) => { e.preventDefault(); dropzone.classList.remove('over'); manejarArchivos(e.dataTransfer.files, gal); }
      }, [
        el('span', { text: '📷' }),
        el('span', { text: 'Arrastrá fotos acá o hacé clic para elegir' }),
        inputFile
      ]);
      seccion.appendChild(dropzone);
    }

    return seccion;
  }

  // ── Subida de archivos ────────────────────────────────────
  async function manejarArchivos(fileList, gal) {
    const files = Array.from(fileList).filter(f => /^image\//.test(f.type));
    if (!files.length) { toast('Solo se pueden subir imágenes.', 'err'); return; }
    for (const file of files) {
      await subirUna(file, gal);
    }
  }

  async function subirUna(file, gal) {
    toast(`Procesando "${file.name}"…`, 'ok');
    try {
      const procesada = await procesarImagen(file);
      const path = `data/barrios/${id}/adjuntos/galeria/${procesada.nombreArchivo}`;

      const shaExistente = await fileExists(path);
      if (!shaExistente) {
        toast(`Subiendo (${formatearPeso(procesada.pesoFinal)})…`, 'ok');
        await putBinaryFile({
          path, base64: procesada.base64,
          message: commitMessage(nombreVisible, 'foto agregada a la galería')
        });
      }

      const yaEnArray = gal.imagenes.some(x => x.id === procesada.id && !x.__eliminar);
      if (yaEnArray) { toast('Esa foto ya está en la galería.', 'ok'); return; }

      gal.imagenes.push({
        id: procesada.id,
        src: path,
        alt: '',
        caption: '',
        __nueva: true,
        __blobUrl: `data:image/jpeg;base64,${procesada.base64}`
      });

      checkDirty();
      pintarTodo();
      toast('Foto agregada.', 'ok');
    } catch (err) {
      toast(`Error al subir "${file.name}": ${err.message}`, 'err');
    }
  }

  // ── Footer: guardar ───────────────────────────────────────
  const dirtyPill = el('span.dirty-pill', { text: 'Sin guardar' });
  const btnGuardar = el('button.btn.primary', {
    onClick: onSave
  }, ['Guardar']);

  container.appendChild(el('div.form-foot', {}, [
    dirtyPill,
    el('div.spacer'),
    el('button.btn.ghost', {
      onClick: () => { if (!dirty.confirmNavigate()) return; dirty.disable(); go(`barrio/${id}`); }
    }, ['Cancelar']),
    btnGuardar
  ]));

  async function onSave() {
    if (!checkDirty()) return;

    const originalBtn = btnGuardar.innerHTML;
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> Guardando…';

    // Preparar informe limpio: limpiar marcas internas de las galerías
    const informeLimpio = JSON.parse(JSON.stringify(informeData));
    for (const b of informeLimpio.bloques) {
      if (b.tipo === 'galeria' && Array.isArray(b.imagenes)) {
        b.imagenes = b.imagenes
          .filter(im => !im.__eliminar)
          .map(im => {
            const clean = { ...im };
            delete clean.__nueva;
            delete clean.__eliminar;
            delete clean.__blobUrl;
            return clean;
          });
      }
    }

    try {
      const result = await putJsonFile({
        path: `data/barrios/${id}/informe.json`,
        content: informeLimpio,
        message: commitMessage(nombreVisible, 'imágenes actualizadas'),
        sha: informeSha
      });
      informeSha = result.content.sha;
      marcarCambio(id, { tipo: 'imagenes', detalle: 'Imágenes actualizadas' });
      dirty.enable(false);
      toast('Imágenes guardadas.', 'ok');

      // Actualizar el snapshot para el dirty tracking
      // (ahora el estado guardado es el actual)
      setTimeout(() => go(`barrio/${id}`), 800);
    } catch (e) {
      manejarErrorGuardado(e);
    } finally {
      btnGuardar.disabled = false;
      btnGuardar.innerHTML = originalBtn;
    }
  }

  // ── Render inicial ────────────────────────────────────────
  pintarTodo();
}
