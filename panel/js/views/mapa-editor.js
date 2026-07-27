/**
 * Editor de mapa (Módulo 6).
 *
 * Un solo editor que gestiona los dos elementos geográficos del barrio:
 *   - Los LÍMITES (polígono naranja que define la zona).
 *   - Los PUNTOS DE INTERÉS (escuelas, comedores, canillas, etc.).
 *
 * Ambos comparten canvas, herramientas de deshacer/rehacer, y ciclo de
 * guardado, por eso se unifican en un único editor.
 *
 * Principios de UX (permanentes, no negociables):
 *   - Barra superior fija: "Editando: <nombre>" siempre a la vista.
 *   - Botones con lenguaje humano. Nunca aparece la palabra "polígono",
 *     "vértice", "coordenada", "GeoJSON" ni ningún término GIS en la UI.
 *   - Preview en vivo: lo que ves es lo que se guarda.
 *   - "Descartar cambios" siempre disponible con la misma prominencia que
 *     "Guardar cambios".
 *   - Sale con doble confirmación si hay cambios sin guardar.
 *
 * Este archivo contiene SOLO el shell visual del editor (M6 · paso 1).
 * La lógica de edición geométrica se agrega en pasos siguientes.
 */

import { el, toast, manejarErrorGuardado } from '../dom.js';
import { icons } from '../icons.js';
import { canEdit } from '../auth.js';
import { go } from '../router.js';
import { dirty } from '../dirty.js';
import { fetchBarrio, fetchGeometria, fetchPuntos, fetchFileWithSha, putJsonFile, commitMessage } from '../github.js';
import { crearMotorMapa, TIPOS_PUNTO } from '../mapa-motor.js';
import { marcarCambio } from '../drafts.js';

export async function renderMapaEditor(container, params) {
  const id = params.id;
  container.innerHTML = '';

  if (!canEdit()) {
    container.appendChild(el('div.callout.warn', {}, [
      el('span', { text: 'Necesitás estar conectado con permisos para editar el mapa de un barrio.' })
    ]));
    return;
  }

  // Skeleton de carga
  const skeleton = el('div.map-editor-loading', {}, [
    el('span.spinner'),
    el('span', { text: 'Cargando el mapa del barrio…' })
  ]);
  container.appendChild(skeleton);

  let barrio, geometria, puntos;
  try {
    barrio = await fetchBarrio(id, { bustCache: true });
    geometria = await fetchGeometria(id, { bustCache: true });
    puntos = await fetchPuntos(id, { bustCache: true });
  } catch (e) {
    skeleton.remove();
    container.appendChild(el('div.callout.err', {}, [
      el('span', { text: `No se pudo cargar el mapa del barrio: ${e.message}` })
    ]));
    return;
  }
  skeleton.remove();

  // ═══ Construir el shell visual ═══
  const editor = el('div.map-editor');
  container.appendChild(editor);

  editor.appendChild(construirBarraSuperior(barrio));
  editor.appendChild(construirCuerpo(barrio, geometria));

  dirty.enable(false);

  // ═══ Instanciar el motor de mapa y conectar la UI ═══
  const slot = editor.querySelector('#mte-map-slot');
  slot.innerHTML = ''; // sacar el placeholder

  const motor = crearMotorMapa(slot, {
    barrio, geometria, puntos,
    onCambio: refrescarUi,
    onHerramientaCambio: (id) => {
      // Actualizar el estado del panel lateral
      const label = editor.querySelector('#mte-herr');
      if (label) label.textContent = etiquetaHerramienta(id) || 'ninguna';
      // Actualizar el hint inferior
      const hint = editor.querySelector('#mte-hint span');
      if (hint) hint.textContent = hintDeHerramienta(id);
    }
  });

  // Reemplazar los handlers "placeholder" de los botones por reales
  editor.querySelectorAll('.mte-tool').forEach(btn => {
    const nuevo = btn.cloneNode(true);
    btn.replaceWith(nuevo);
    nuevo.addEventListener('click', () => {
      const idHerr = nuevo.getAttribute('data-tool');
      const yaActiva = nuevo.classList.contains('active');
      editor.querySelectorAll('.mte-tool.active').forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      if (yaActiva) {
        // Volver a hacer clic en la herramienta activa la desactiva
        nuevo.setAttribute('aria-pressed', 'false');
        motor.activarHerramienta(null);
      } else {
        nuevo.classList.add('active');
        nuevo.setAttribute('aria-pressed', 'true');
        motor.activarHerramienta(idHerr);
      }
    });
  });

  // Botones de deshacer/rehacer
  const btnUndo = editor.querySelector('.mte-undo');
  const btnRedo = editor.querySelector('.mte-redo');
  btnUndo.addEventListener('click', () => motor.deshacer());
  btnRedo.addEventListener('click', () => motor.rehacer());

  // Botones de descartar/guardar
  const btnDescartar = editor.querySelector('.mte-descartar');
  const btnGuardar = editor.querySelector('.mte-guardar');

  btnDescartar.addEventListener('click', async () => {
    if (!motor.hayCambios()) return;
    const ok = confirm('¿Seguro que querés descartar todos los cambios sin guardar? Esta acción no se puede deshacer.');
    if (!ok) return;
    motor.descartarCambios();
    toast('Cambios descartados. El mapa volvió a como estaba.', 'ok');
  });

  btnGuardar.addEventListener('click', async () => {
    if (!motor.hayCambios()) return;

    // Si hay un redibujado en curso sin cerrar (el usuario colocó puntos
    // en modo "Rehacer el contorno" pero no hizo doble clic para
    // terminar), esos puntos no están todavía en el contorno guardable.
    // Guardar en este momento descartaría silenciosamente ese trabajo.
    // Preferimos bloquear con un mensaje claro antes que perder datos.
    const puntosBorrador = motor.puntosBorrador?.();
    if (puntosBorrador != null && puntosBorrador > 0) {
      toast('Terminá de dibujar el contorno antes de guardar: hacé doble clic para cerrarlo, o elegí otra herramienta para cancelar el dibujo.', 'err');
      return;
    }

    const originalBtn = btnGuardar.innerHTML;
    btnGuardar.disabled = true;
    btnGuardar.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> Guardando…';

    try {
      // Refetch de SHAs actuales (para detectar conflictos)
      const pathGeom = `data/barrios/${id}/geometria.geojson`;
      const pathPuntos = `data/barrios/${id}/puntos.geojson`;

      let shaGeom = null, shaPuntos = null;
      try { const g = await fetchFileWithSha(pathGeom); shaGeom = g.sha; } catch { /* no existe = crear */ }
      try { const p = await fetchFileWithSha(pathPuntos); shaPuntos = p.sha; } catch { /* no existe = crear */ }

      // 1. Guardar geometría
      await putJsonFile({
        path: pathGeom,
        content: motor.obtenerGeoJson(),
        message: commitMessage(barrio.nombreVisible, 'límites del mapa actualizados'),
        sha: shaGeom
      });

      // 2. Guardar puntos
      await putJsonFile({
        path: pathPuntos,
        content: motor.obtenerPuntosGeoJson(),
        message: commitMessage(barrio.nombreVisible, 'puntos de interés actualizados'),
        sha: shaPuntos
      });

      motor.marcarGuardado();
      marcarCambio(id, { tipo: 'mapa', ts: Date.now() });
      toast('Guardado. Los cambios ya están en el mapa público (puede tardar 1–2 minutos en verse).', 'ok');
    } catch (e) {
      manejarErrorGuardado(e);
    } finally {
      btnGuardar.innerHTML = originalBtn;
      btnGuardar.disabled = !motor.hayCambios();
    }
  });

  function refrescarUi() {
    // Estado del panel lateral
    const cambios = motor.hayCambios();
    const labelCambios = editor.querySelector('#mte-cambios');
    if (labelCambios) labelCambios.textContent = cambios ? 'sí' : 'ninguno';

    // Hint dinámico: durante el redibujado muestra progreso; fuera de
    // ese modo, muestra el hint fijo de la herramienta activa.
    const puntosBorrador = motor.puntosBorrador?.();
    const hint = editor.querySelector('#mte-hint span');
    if (hint) {
      if (puntosBorrador != null) {
        if (puntosBorrador === 0) {
          hint.textContent = 'Hacé clic para colocar el primer punto.';
        } else if (puntosBorrador < 3) {
          hint.textContent = `Llevás ${puntosBorrador} punto${puntosBorrador === 1 ? '' : 's'}. Necesitás al menos 3 para cerrar el contorno.`;
        } else {
          hint.textContent = `Llevás ${puntosBorrador} puntos. Doble clic para terminar el contorno.`;
        }
      } else {
        // Sin redibujado activo: mostrar el hint fijo de la herramienta
        const herrActual = editor.querySelector('.mte-tool.active')?.getAttribute('data-tool');
        hint.textContent = hintDeHerramienta(herrActual);
      }
    }

    // Lista de puntos de interés
    renderizarListaPuntos(motor.obtenerPuntos());

    btnDescartar.disabled = !cambios;
    btnGuardar.disabled = !cambios;
    btnUndo.disabled = !motor.puedeDeshacer();
    btnRedo.disabled = !motor.puedeRehacer();

    dirty.enable(cambios);
  }

  function renderizarListaPuntos(puntos) {
    const cont = editor.querySelector('#mte-puntos-lista');
    if (!cont) return;
    cont.innerHTML = '';
    if (!puntos.length) {
      cont.appendChild(el('p.mut', { text: 'La lista de puntos aparece acá cuando agregues alguno.' }));
      return;
    }
    puntos.forEach(punto => {
      const item = el('div.mte-punto-item');

      const emoji = TIPOS_PUNTO.find(t => t.id === punto.tipo)?.emoji || '📍';
      const cabezal = el('div.mte-punto-cabezal', {}, [
        el('span.mte-punto-emoji-mini', { text: emoji }),
        el('input.mte-punto-nombre', {
          value: punto.nombre,
          placeholder: 'Sin nombre',
          onChange: (e) => motor.renombrarPunto(punto.id, e.target.value.trim())
        })
      ]);
      item.appendChild(cabezal);

      const select = el('select.mte-punto-tipo', {
        onChange: (e) => motor.cambiarTipoPunto(punto.id, e.target.value)
      });
      TIPOS_PUNTO.forEach(t => {
        const opt = el('option', { value: t.id, text: `${t.emoji}  ${t.label}` });
        if (t.id === punto.tipo) opt.setAttribute('selected', 'selected');
        select.appendChild(opt);
      });
      item.appendChild(select);

      cont.appendChild(item);
    });
  }

  refrescarUi();
}

const HERRAMIENTAS = {
  'mover-limites':  { label: 'Mover un punto del contorno',  hint: 'Arrastrá un punto blanco del contorno para moverlo.' },
  'agregar-limite': { label: 'Agregar un punto al contorno', hint: 'Hacé clic sobre el contorno para insertar un punto nuevo.' },
  'quitar-limite':  { label: 'Quitar un punto del contorno', hint: 'Hacé clic sobre un punto del contorno para eliminarlo.' },
  'redibujar':      { label: 'Rehacer el contorno',          hint: 'Hacé clic para agregar puntos. Doble clic para terminar.' },
  'agregar-punto':  { label: 'Agregar un punto de interés',  hint: 'Hacé clic en el mapa donde quieras agregar el punto.' },
  'mover-punto':    { label: 'Mover un punto de interés',    hint: 'Arrastrá un punto para moverlo a su nueva ubicación.' },
  'duplicar':       { label: 'Duplicar un punto',            hint: 'Hacé clic sobre el punto que querés duplicar.' },
  'quitar-punto':   { label: 'Eliminar un punto',            hint: 'Hacé clic sobre el punto que querés eliminar.' }
};
function etiquetaHerramienta(id) { return HERRAMIENTAS[id]?.label; }
function hintDeHerramienta(id) {
  return HERRAMIENTAS[id]?.hint || 'Elegí una herramienta a la izquierda para empezar a editar.';
}

/* ─── Barra superior fija ─────────────────────────────────────
   Muestra el barrio en edición con su color como pincelada de identidad.
   Nunca se tapa con scroll. Contiene el botón "Salir del editor" bien
   visible, porque cerrar la sesión de edición es una acción crítica.
   ──────────────────────────────────────────────────────────── */

function construirBarraSuperior(barrio) {
  const barra = el('div.map-editor-topbar');

  const identidad = el('div.mte-identidad', {}, [
    el('span.mte-swatch', { style: { background: barrio.color } }),
    el('div.mte-titulo', {}, [
      el('span.mte-etiqueta', { text: 'Editando' }),
      el('span.mte-nombre', { text: barrio.nombreVisible })
    ])
  ]);

  const acciones = el('div.mte-acciones-top', {}, [
    el('button.btn.ghost.btn-salir', {
      onClick: () => salirDelEditor(barrio.id)
    }, [
      el('span', { html: icons.close() }).firstChild,
      el('span', { text: 'Salir del editor' })
    ])
  ]);

  barra.appendChild(identidad);
  barra.appendChild(acciones);
  return barra;
}

function salirDelEditor(barrioId) {
  if (!dirty.confirmNavigate()) return;
  dirty.disable();
  go(`barrio/${barrioId}`);
}

/* ─── Cuerpo: toolbar + mapa + panel lateral ──────────────── */

function construirCuerpo(barrio, geometria) {
  const cuerpo = el('div.map-editor-body');
  cuerpo.appendChild(construirToolbar(barrio));
  cuerpo.appendChild(construirCanvas(barrio, geometria));
  cuerpo.appendChild(construirPanelLateral(barrio));
  return cuerpo;
}

/* ─── Toolbar de herramientas (columna izquierda) ────────── */

function construirToolbar(barrio) {
  const tb = el('div.map-editor-toolbar');

  tb.appendChild(el('div.mte-toolbar-grupo', {}, [
    el('h3', { text: 'Límites del barrio' }),
    botonHerramienta('mover-limites',  'Mover un punto',      icons.move,      'Arrastrar un punto del contorno'),
    botonHerramienta('agregar-limite', 'Agregar un punto',    icons.plus,      'Insertar un punto nuevo en el contorno'),
    botonHerramienta('quitar-limite',  'Quitar un punto',     icons.trash,     'Sacar un punto del contorno'),
    botonHerramienta('redibujar',      'Rehacer el contorno', icons.edit,      'Reemplaza el contorno actual dibujando uno nuevo desde cero')
  ]));

  tb.appendChild(el('div.mte-toolbar-grupo', {}, [
    el('h3', { text: 'Puntos de interés' }),
    botonHerramienta('agregar-punto', 'Agregar un punto',    icons.pin,       'Clic en el mapa para agregar'),
    botonHerramienta('mover-punto',   'Mover un punto',      icons.move,      'Arrastrar un punto existente'),
    botonHerramienta('duplicar',      'Duplicar un punto',   icons.copy,      'Copiar un punto para moverlo'),
    botonHerramienta('quitar-punto',  'Eliminar un punto',   icons.trash,     'Sacar un punto del mapa')
  ]));

  tb.appendChild(el('div.mte-toolbar-grupo', {}, [
    el('h3', { text: 'Deshacer y rehacer' }),
    el('div.mte-undo-row', {}, [
      el('button.btn.ghost.mte-undo', { disabled: 'disabled', title: 'Deshacer último cambio' }, [
        el('span', { html: icons.undo() }).firstChild,
        el('span', { text: 'Deshacer' })
      ]),
      el('button.btn.ghost.mte-redo', { disabled: 'disabled', title: 'Rehacer último cambio' }, [
        el('span', { html: icons.redo() }).firstChild,
        el('span', { text: 'Rehacer' })
      ])
    ])
  ]));

  return tb;
}

function botonHerramienta(id, label, icon, hint) {
  const btn = el('button.btn.ghost.mte-tool', {
    'data-tool': id,
    'aria-pressed': 'false',
    title: hint
  }, [
    el('span', { html: icon() }).firstChild,
    el('span', { text: label })
  ]);
  btn.addEventListener('click', () => {
    // La lógica real llega en el paso 2. Por ahora solo cambiamos el estado
    // visual para que se vea que responde y comprobar que la UX funciona.
    document.querySelectorAll('.mte-tool.active').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    toast('La herramienta se activará en el próximo paso.', 'ok');
  });
  return btn;
}

/* ─── Canvas del mapa (centro) ─────────────────────────────── */

function construirCanvas(barrio, geometria) {
  const canvas = el('div.map-editor-canvas', {}, [
    // Placeholder del mapa Leaflet. En el paso 2 se monta ahí el mapa real.
    el('div.mte-map-slot', { id: 'mte-map-slot' }, [
      el('div.mte-map-placeholder', {}, [
        el('span.spinner'),
        el('p', { text: 'Acá aparecerá el mapa con los límites y puntos del barrio.' }),
        el('p.mut', { text: 'El mapa real se monta en el próximo paso.' })
      ])
    ]),

    // Overlay inferior con la leyenda de la herramienta activa
    el('div.mte-hint', { id: 'mte-hint' }, [
      el('span', { text: 'Elegí una herramienta a la izquierda para empezar a editar.' })
    ])
  ]);
  return canvas;
}

/* ─── Panel lateral (columna derecha) ─────────────────────── */

function construirPanelLateral(barrio) {
  const panel = el('div.map-editor-side');

  // Sección: estado
  panel.appendChild(el('div.mte-side-grupo', {}, [
    el('h3', { text: 'Estado' }),
    el('div.mte-estado', {}, [
      el('div.mte-estado-item', {}, [
        el('span.k', { text: 'Cambios sin guardar' }),
        el('span.v', { id: 'mte-cambios', text: 'ninguno' })
      ]),
      el('div.mte-estado-item', {}, [
        el('span.k', { text: 'Herramienta activa' }),
        el('span.v', { id: 'mte-herr', text: 'ninguna' })
      ])
    ])
  ]));

  // Sección: lista de puntos de interés (se llena en el paso 3)
  panel.appendChild(el('div.mte-side-grupo', {}, [
    el('h3', { text: 'Puntos del barrio' }),
    el('div.mte-puntos-lista', { id: 'mte-puntos-lista' }, [
      el('p.mut', { text: 'La lista de puntos aparece acá cuando agregues alguno.' })
    ])
  ]));

  // Acciones al pie: descartar / guardar
  panel.appendChild(el('div.mte-side-acciones', {}, [
    el('p.mte-aviso-publicar', {
      html: '⚡ <b>Guardar publica</b> los cambios en el mapa público. Usá <b>Descartar</b> si te arrepentís antes.'
    }),
    el('button.btn.ghost.mte-descartar', { disabled: 'disabled' }, ['Descartar cambios']),
    el('button.btn.primary.mte-guardar', { disabled: 'disabled' }, ['Guardar y publicar'])
  ]));

  return panel;
}
