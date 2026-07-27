/**
 * Editor de galería fotográfica del informe.
 *
 * Se abre desde el editor de informe al hacer clic en un bloque de tipo
 * "galeria". Recibe el bloque, permite editarlo, y devuelve el bloque
 * modificado. NO commitea al repo directamente: el guardado real ocurre
 * cuando el usuario aprieta "Guardar" en el editor de informe (patrón
 * estándar, ver docs/PATRON-EDITOR.md).
 *
 * Lo que sí hace este editor es SUBIR los archivos nuevos al repo,
 * porque son binarios que no encajan en el JSON del informe. Se suben
 * apenas terminan de procesarse, con progreso individual visible.
 *
 * Nombres estables: cada archivo tiene como nombre un hash corto del
 * contenido procesado. Nunca se renombra. El orden vive en el array
 * del JSON.
 *
 * Eliminación diferida: al eliminar una imagen se saca del array y se
 * marca el archivo para borrado en la próxima Publicación (drafts.js).
 */

import { el, toast, manejarErrorGuardado } from '../dom.js';
import { icons } from '../icons.js';
import { procesarImagen, formatearAhorro, formatearPeso } from '../image-pipeline.js';
import { putBinaryFile, fileExists, commitMessage } from '../github.js';
import { marcarArchivoParaEliminar, desmarcarArchivo } from '../drafts.js';

/**
 * Abre el editor de galería como un modal.
 * @param {object} params
 *   - barrioId: string
 *   - nombreVisible: string  (para los mensajes de commit)
 *   - bloque: objeto de tipo "galeria" (referencia; se modifica)
 *   - onChange: () => void   (avisar al editor padre que hubo cambios)
 *   - onClose: () => void
 */
export function abrirEditorGaleria({ barrioId, nombreVisible, bloque, onChange, onClose }) {
  // Estructura del bloque:
  //   { tipo: 'galeria', titulo: string, imagenes: [{id, src, alt, caption}] }
  // Aseguramos que cada imagen tenga id (para las nuevas y las viejas migradas)
  bloque.imagenes ||= [];

  const overlay = el('div.modal-overlay');
  const modal = el('div.modal.galeria-modal');
  overlay.appendChild(modal);

  const header = el('div.modal-head', {}, [
    el('div', {}, [
      el('h2', { text: 'Editar galería fotográfica' }),
      el('p.sub', { text: 'Los cambios se aplican al guardar el informe.' })
    ]),
    el('button.icon-btn', { title: 'Cerrar', onClick: cerrar, html: icons.close() })
  ]);
  modal.appendChild(header);

  const body = el('div.modal-body');
  modal.appendChild(body);

  // Título editable de la galería
  const inpTitulo = el('input.inp', {
    value: bloque.titulo || '', placeholder: 'Título de la galería',
    onInput: (e) => { bloque.titulo = e.target.value; onChange(); }
  });
  body.appendChild(el('div.field', {}, [
    el('label', { text: 'Título de la sección' }),
    inpTitulo
  ]));

  // Grilla de fotos
  const grid = el('div.gal-grid');
  body.appendChild(el('p.sec-label', { text: 'Fotos' }));
  body.appendChild(grid);

  // Zona de subida (drag & drop + input file)
  const inputFile = el('input', {
    type: 'file', accept: 'image/*', multiple: 'multiple',
    style: { display: 'none' },
    onChange: (e) => manejarArchivos(e.target.files)
  });
  const dropzone = el('div.gal-dropzone', {
    onClick: () => inputFile.click(),
    onDragOver: (e) => { e.preventDefault(); dropzone.classList.add('over'); },
    onDragLeave: () => dropzone.classList.remove('over'),
    onDrop: (e) => { e.preventDefault(); dropzone.classList.remove('over'); manejarArchivos(e.dataTransfer.files); }
  }, [
    el('span.dz-ico', { html: icons.upload() }),
    el('div', {}, [
      el('b', { text: 'Arrastrá fotos acá' }),
      el('span', { text: 'o hacé clic para elegir del dispositivo (podés elegir varias).' })
    ]),
    inputFile
  ]);
  body.appendChild(dropzone);

  body.appendChild(el('div.callout.info', { style: { marginTop: '16px' } }, [
    el('span', { html: icons.info() }).firstChild,
    el('span', { text: 'Las fotos se redimensionan a 1600 px de lado largo y se convierten a JPEG para que el informe cargue rápido.' })
  ]));

  const foot = el('div.modal-foot', {}, [
    el('div.spacer'),
    el('button.btn.primary', { onClick: cerrar }, ['Listo'])
  ]);
  modal.appendChild(foot);

  document.body.appendChild(overlay);
  requestAnimationFrame(() => overlay.classList.add('open'));

  function cerrar() {
    overlay.classList.remove('open');
    setTimeout(() => { overlay.remove(); onClose && onClose(); }, 200);
  }

  /* ─── Render de la grilla ────────────────────────────────────── */

  function pintar() {
    grid.innerHTML = '';
    if (!bloque.imagenes.length) {
      grid.appendChild(el('div.gal-empty', {}, [
        el('span', { text: 'Todavía no hay fotos en esta galería.' })
      ]));
      return;
    }
    bloque.imagenes.forEach((img, i) => grid.appendChild(renderMiniatura(img, i)));
  }

  function renderMiniatura(img, i) {
    // ¿Está marcada para eliminar? (state local en el bloque)
    const marcada = img.__eliminar === true;
    const card = el('div.gal-card' + (marcada ? '.marcada' : ''));

    const thumb = el('div.gal-thumb', {}, [
      el('img', { src: img.src, alt: img.alt || '' })
    ]);
    card.appendChild(thumb);

    if (marcada) {
      thumb.appendChild(el('div.gal-overlay', {}, [
        el('span', { text: 'Se eliminará al publicar' })
      ]));
    }

    const acciones = el('div.gal-acciones', {}, [
      el('button.mini-btn', {
        type: 'button', title: 'Mover atrás', 'aria-label': 'Mover foto hacia atrás',
        disabled: i === 0 ? 'disabled' : null,
        onClick: () => { mover(i, -1); }
      }, ['←']),
      el('button.mini-btn', {
        type: 'button', title: 'Mover adelante', 'aria-label': 'Mover foto hacia adelante',
        disabled: i === bloque.imagenes.length - 1 ? 'disabled' : null,
        onClick: () => { mover(i, 1); }
      }, ['→']),
      el('div.spacer'),
      marcada
        ? el('button.mini-btn.restore', { type: 'button', title: 'Deshacer', 'aria-label': 'Deshacer eliminación de la foto',
            onClick: () => desmarcarEliminar(i) }, [icons.undo()])
        : el('button.mini-btn.danger', { type: 'button', title: 'Eliminar', 'aria-label': 'Eliminar foto',
            onClick: () => marcarEliminar(i) }, ['✕'])
    ]);
    card.appendChild(acciones);

    const caption = el('input.inp', {
      value: img.caption || img.alt || '', placeholder: 'Descripción (aparece bajo la foto)',
      onInput: (e) => { img.caption = e.target.value; img.alt = e.target.value; onChange(); }
    });
    card.appendChild(el('div.gal-caption-wrap', {}, [caption]));

    return card;
  }

  function mover(i, delta) {
    const j = i + delta;
    if (j < 0 || j >= bloque.imagenes.length) return;
    const [x] = bloque.imagenes.splice(i, 1);
    bloque.imagenes.splice(j, 0, x);
    pintar(); onChange();
  }

  function marcarEliminar(i) {
    const img = bloque.imagenes[i];
    img.__eliminar = true;
    // Si es una imagen recién subida en esta sesión (no estaba en el original),
    // el editor padre la va a ignorar al guardar. Si ya existía, la marcamos
    // para borrado diferido.
    if (!img.__nueva && img.src) {
      marcarArchivoParaEliminar(barrioId, img.src);
    }
    pintar(); onChange();
  }

  function desmarcarEliminar(i) {
    const img = bloque.imagenes[i];
    img.__eliminar = false;
    if (!img.__nueva && img.src) {
      desmarcarArchivo(barrioId, img.src);
    }
    pintar(); onChange();
  }

  /* ─── Subida de archivos nuevos ──────────────────────────────── */

  async function manejarArchivos(fileList) {
    const files = Array.from(fileList).filter(f => /^image\//.test(f.type));
    if (!files.length) {
      toast('Solo se pueden subir imágenes.', 'err');
      return;
    }
    for (const file of files) {
      await subirUna(file);
    }
  }

  async function subirUna(file) {
    // Placeholder visual mientras procesa y sube
    const placeholder = el('div.gal-card.gal-loading', {}, [
      el('div.gal-thumb', {}, [el('span.spinner')]),
      el('div.gal-progress-wrap', {}, [
        el('div.gal-progress-bar', {}, [el('div.gal-progress-fill')]),
        el('span.gal-progress-tx', { text: `Procesando "${file.name}"…` })
      ])
    ]);
    grid.appendChild(placeholder);
    const setEstado = (tx, pct) => {
      placeholder.querySelector('.gal-progress-tx').textContent = tx;
      if (pct != null) placeholder.querySelector('.gal-progress-fill').style.width = pct + '%';
    };

    try {
      setEstado(`Procesando "${file.name}"…`, 20);
      const procesada = await procesarImagen(file);

      const path = `data/barrios/${barrioId}/adjuntos/galeria/${procesada.nombreArchivo}`;

      // Dedupe: si ya existe un archivo con el mismo hash, no re-subir.
      setEstado(`Verificando…`, 50);
      const shaExistente = await fileExists(path);

      if (!shaExistente) {
        setEstado(`Subiendo (${formatearPeso(procesada.pesoFinal)})…`, 70);
        await putBinaryFile({
          path, base64: procesada.base64,
          message: commitMessage(nombreVisible, `foto agregada a la galería`)
        });
      }

      // Chequear si ya está en el array (por si el usuario sube dos veces
      // la misma foto en la misma sesión)
      const yaEnArray = bloque.imagenes.some(x => x.id === procesada.id && !x.__eliminar);
      if (yaEnArray) {
        toast('Esa foto ya está en la galería.', 'ok');
        placeholder.remove();
        return;
      }

      bloque.imagenes.push({
        id: procesada.id,
        src: path,
        alt: '',
        caption: '',
        __nueva: true   // marca interna: se subió en esta sesión
      });

      placeholder.remove();
      pintar();
      onChange();

      toast(`Foto agregada. ${formatearAhorro(procesada.pesoOriginal, procesada.pesoFinal)}`, 'ok');
    } catch (e) {
      placeholder.remove();
      manejarErrorGuardado(e);
      // Resetear el input de archivos para que el usuario pueda reintentar
      // la misma foto sin tener que deseleccionarla primero.
      inputFile.value = '';
    }
  }

  pintar();
}
