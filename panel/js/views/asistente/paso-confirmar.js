/**
 * Paso 4 del asistente: Confirmación y creación real.
 *
 * Muestra un resumen visual de lo cargado en los 3 pasos anteriores y
 * ofrece el botón "Crear barrio". Al confirmar, ejecuta los 6 PUTs
 * necesarios EN ORDEN INVERSO DE IMPORTANCIA:
 *
 *   1. barrio.json               — info + indicadores
 *   2. geometria.geojson         — polígono
 *   3. puntos.geojson            — FeatureCollection vacía
 *   4. informe.json              — estructura mínima
 *   5. adjuntos/galeria/.gitkeep — carpeta lista
 *   6. index.json                — ACTUALIZADO AL FINAL (hace visible el barrio)
 *
 * Si algo falla antes del PUT 6, el barrio queda "invisible" (sus
 * archivos existen en el repo pero no aparecen en el índice). El
 * usuario puede reintentar; los PUTs son idempotentes (usan SHA cuando
 * el archivo ya existe).
 */

import { el, toast } from '../../dom.js';
import { icons } from '../../icons.js';
import { fetchFileWithSha, putJsonFile, putTextFile, commitMessage } from '../../github.js';

export function renderPasoConfirmar(cuerpo, pie, ctrl) {
  const { estado } = ctrl;

  cuerpo.appendChild(el('div.asist-paso-titulo', {}, [
    el('h3', { text: 'Revisá los datos antes de crear el barrio' }),
    el('p', { text: 'Una vez creado, el barrio se puede editar desde su hub. El informe y las fotos se agregan después.' })
  ]));

  // ─── Resumen visual ──────────────────────────────────────
  const resumen = el('div.asist-resumen');

  // Identidad
  resumen.appendChild(seccionResumen('Identidad', [
    filaResumen('Nombre', estado.nombreVisible),
    filaResumen('Zona',   estado.zona),
    filaResumen('Color',  el('span.asist-resumen-color', {
      style: { background: estado.color },
      title: estado.color
    })),
    filaResumen('Identificador', el('code', { text: estado.slug }))
  ]));

  // Contorno
  const puntosContorno = (estado.contorno || []).length;
  resumen.appendChild(seccionResumen('Ubicación en el mapa', [
    filaResumen('Contorno',
      puntosContorno >= 3
        ? `Dibujado con ${puntosContorno} puntos`
        : el('span.asist-resumen-warn', { text: 'Falta dibujar' })
    )
  ]));

  // Datos base
  const filasDatos = [
    filaResumen('Cobertura eléctrica', estado.datosMapa.electricidad ? `${estado.datosMapa.electricidad}%` : '—'),
    filaResumen('Educación', estado.datosMapa.educacion ? 'Sí' : 'No'),
    filaResumen('Salud',     estado.datosMapa.salud ? 'Sí' : 'No')
  ];
  estado.indicadores.forEach(ind => {
    filasDatos.push(filaResumen(ind.etiqueta, ind.valor || '—'));
  });
  resumen.appendChild(seccionResumen('Datos base', filasDatos));

  cuerpo.appendChild(resumen);

  // Progreso durante la creación
  const progreso = el('div.asist-progreso', { id: 'asist-progreso' });
  cuerpo.appendChild(progreso);

  // ─── Pie con botones ────────────────────────────────────
  const btnAtras = el('button.btn.ghost', { onClick: () => ctrl.anterior() }, ['← Atrás']);
  const btnCrear = el('button.btn.primary.asist-crear-btn', {
    onClick: () => confirmarYCrear(estado, ctrl, btnCrear, btnAtras, progreso)
  }, ['✓ Crear el barrio']);

  pie.appendChild(btnAtras);
  pie.appendChild(el('div.spacer'));
  pie.appendChild(btnCrear);
}

function seccionResumen(titulo, filas) {
  return el('div.asist-resumen-seccion', {}, [
    el('h4', { text: titulo }),
    el('div.asist-resumen-tabla', {}, filas)
  ]);
}

function filaResumen(etiqueta, valor) {
  const contenido = valor instanceof Node ? valor : el('span', { text: String(valor) });
  return el('div.asist-resumen-fila', {}, [
    el('span.asist-resumen-etiqueta', { text: etiqueta }),
    contenido
  ]);
}

/* ═══════════════════════════════════════════════════════════════════
   Creación real: orquesta los 6 PUTs en orden y muestra progreso
   ═══════════════════════════════════════════════════════════════════ */

async function confirmarYCrear(estado, ctrl, btnCrear, btnAtras, progreso) {
  // Bloquear botones durante la creación
  btnCrear.disabled = true;
  btnAtras.disabled = true;
  btnCrear.innerHTML = '<span class="spinner" style="border-color:rgba(255,255,255,.35);border-top-color:#fff"></span> Creando…';

  const pasos = [
    { id: 1, label: 'Guardando información general',   fn: crearBarrioJson },
    { id: 2, label: 'Guardando contorno en el mapa',   fn: crearGeometria },
    { id: 3, label: 'Preparando puntos de interés',    fn: crearPuntos },
    { id: 4, label: 'Preparando informe',              fn: crearInforme },
    { id: 5, label: 'Preparando carpeta de imágenes',  fn: crearGitkeep },
    { id: 6, label: 'Publicando en la lista de barrios', fn: actualizarIndex }
  ];

  progreso.innerHTML = '';
  const filas = pasos.map(p => {
    const fila = el('div.asist-progreso-fila', {}, [
      el('span.asist-progreso-icono', { text: '○' }),
      el('span.asist-progreso-label', { text: p.label })
    ]);
    progreso.appendChild(fila);
    return fila;
  });

  try {
    for (let i = 0; i < pasos.length; i++) {
      filas[i].querySelector('.asist-progreso-icono').textContent = '⏳';
      filas[i].classList.add('en-curso');

      await pasos[i].fn(estado);

      filas[i].querySelector('.asist-progreso-icono').textContent = '✓';
      filas[i].classList.remove('en-curso');
      filas[i].classList.add('completo');
    }

    toast('¡Barrio creado! Te llevo a su hub para que lo termines de completar.', 'ok');
    // Pequeña pausa para que se vea el ✓ del último paso
    await new Promise(r => setTimeout(r, 600));
    ctrl.finalizar();
  } catch (e) {
    console.error(e);
    // Marcar el paso fallido en rojo
    const idxFallido = filas.findIndex(f => f.classList.contains('en-curso'));
    if (idxFallido >= 0) {
      filas[idxFallido].querySelector('.asist-progreso-icono').textContent = '✗';
      filas[idxFallido].classList.remove('en-curso');
      filas[idxFallido].classList.add('fallo');
    }
    const mensaje = e.code === 'unauthorized'
      ? 'Tu clave de acceso ya no es válida. Reconectate y volvé a intentarlo.'
      : e.code === 'conflict'
        ? 'Otra persona modificó algo al mismo tiempo. Cerrá el asistente, actualizá la lista y volvé a intentar.'
        : (e.message || 'Ocurrió un error al crear el barrio.');
    progreso.appendChild(el('div.asist-progreso-error', {}, [
      el('strong', { text: 'No se pudo completar la creación.' }),
      el('p', { text: mensaje })
    ]));
    // Reactivar los botones para que pueda reintentar o volver
    btnCrear.disabled = false;
    btnAtras.disabled = false;
    btnCrear.innerHTML = 'Reintentar creación';
  }
}

/* ─── Funciones de creación individual ────────────────────── */

async function crearBarrioJson(estado) {
  const contenido = {
    schemaVersion: 2,
    id: estado.slug,
    nombreVisible: estado.nombreVisible,
    color: estado.color,
    colorClaro: estado.colorClaro,
    zona: estado.zona,
    informeUrl: `Relevamiento ${estado.nombreVisible}.html`,
    estado: 'borrador',
    fechaActualizacion: null,
    versionActual: null,
    datosMapa: { ...estado.datosMapa },
    indicadores: estado.indicadores.map(i => ({ ...i }))
  };
  await putJsonFileConSHA(`data/barrios/${estado.slug}/barrio.json`, contenido,
    commitMessage(estado.nombreVisible, 'barrio creado'));
}

async function crearGeometria(estado) {
  const anilloLngLat = estado.contorno.map(([lat, lng]) => [lng, lat]);
  // Cerrar el anillo
  if (anilloLngLat.length && (
    anilloLngLat[0][0] !== anilloLngLat[anilloLngLat.length-1][0] ||
    anilloLngLat[0][1] !== anilloLngLat[anilloLngLat.length-1][1]
  )) {
    anilloLngLat.push([anilloLngLat[0][0], anilloLngLat[0][1]]);
  }
  const contenido = {
    type: 'FeatureCollection',
    features: [{
      type: 'Feature',
      properties: { id: estado.slug, nombre: estado.nombreVisible },
      geometry: { type: 'Polygon', coordinates: [anilloLngLat] }
    }]
  };
  await putJsonFileConSHA(`data/barrios/${estado.slug}/geometria.geojson`, contenido,
    commitMessage(estado.nombreVisible, 'contorno del mapa agregado'));
}

async function crearPuntos(estado) {
  const contenido = { type: 'FeatureCollection', features: [] };
  await putJsonFileConSHA(`data/barrios/${estado.slug}/puntos.geojson`, contenido,
    commitMessage(estado.nombreVisible, 'puntos de interés inicializados'));
}

async function crearInforme(estado) {
  // Estructura mínima válida — el editor de informe llenará esto después
  const contenido = {
    schemaVersion: 1,
    barrioId: estado.slug,
    formato: 'estructurado',
    titleTag: `Relevamiento ${estado.nombreVisible} — Cooperativa Eléctrica`,
    fuentesHref: 'https://fonts.googleapis.com/css2?family=Playfair+Display:wght@600;700&family=Source+Sans+3:wght@300;400;600&display=swap',
    estilos: '',
    encabezado: {
      titulo: `Relevamiento ${estado.nombreVisible}`,
      subtitulo: 'Cooperativa Eléctrica de Concordia — Unidad de Relevamiento Estratégico',
      fecha: '',
      zonaEtiqueta: 'Zona',
      zonaValor: estado.zona,
      logoSrc: 'logo_cooperativa_transparente.png'
    },
    navVolver: { href: 'Mapa Relevamiento Asentamientos.html', texto: '← Volver al mapa' },
    footer: '',
    lightbox: false,
    bloques: [
      {
        id: 'blq-01',
        tipo: 'seccion',
        icono: '📝',
        titulo: 'Informe pendiente',
        contenido: [
          { tipo: 'parrafo', texto: 'Este informe está pendiente de completar. Editalo desde el hub del barrio.' }
        ]
      }
    ]
  };
  await putJsonFileConSHA(`data/barrios/${estado.slug}/informe.json`, contenido,
    commitMessage(estado.nombreVisible, 'informe inicial creado'));
}

async function crearGitkeep(estado) {
  // Un archivo vacío .gitkeep para que la carpeta exista en Git.
  // GitHub Contents API no admite archivos sin contenido, así que usamos
  // un comentario mínimo.
  await putTextFileConSHA(
    `data/barrios/${estado.slug}/adjuntos/galeria/.gitkeep`,
    '# Carpeta de galería del barrio\n',
    commitMessage(estado.nombreVisible, 'carpeta de galería inicializada')
  );
}

async function actualizarIndex(estado) {
  // Refetch del index actual con SHA para detectar conflictos
  const { data: idxActual, sha } = await fetchFileWithSha('data/barrios/index.json');
  const nuevo = {
    ...idxActual,
    barrios: [
      ...(idxActual.barrios || []),
      {
        id: estado.slug,
        nombreVisible: estado.nombreVisible,
        color: estado.color,
        estado: 'borrador'
      }
    ]
  };
  await putJsonFile({
    path: 'data/barrios/index.json',
    content: nuevo,
    message: commitMessage(estado.nombreVisible, 'agregado a la lista de barrios'),
    sha
  });
}

/* ═══ helpers de PUT con manejo de "ya existía" ═══ */

/**
 * PUT idempotente para JSON: si el archivo no existe → crea (sin SHA),
 * si ya existe (por un reintento) → actualiza (con SHA). Así los
 * reintentos son seguros.
 */
async function putJsonFileConSHA(path, content, message) {
  let sha = null;
  try {
    const info = await fetchFileWithSha(path);
    sha = info.sha;
  } catch { /* no existía, se crea */ }
  await putJsonFile({ path, content, message, sha });
}

async function putTextFileConSHA(path, text, message) {
  let sha = null;
  try {
    const info = await fetchFileWithSha(path);
    sha = info.sha;
  } catch { /* no existía, se crea */ }
  await putTextFile({ path, text, message, sha });
}
