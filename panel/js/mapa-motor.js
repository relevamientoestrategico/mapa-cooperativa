/**
 * Motor de edición de mapa.
 *
 * Encapsula toda la lógica pesada del editor:
 *   - Inicialización de Leaflet con las tiles del spec del proyecto.
 *   - Renderizado del polígono actual y sus vértices como manijas.
 *   - Máquina de estados de herramientas (una activa a la vez).
 *   - Historial de deshacer/rehacer (stack inmutable de estados).
 *   - Notificaciones de cambio para que la UI se refresque sola.
 *
 * Diseño: cada operación de edición produce un estado nuevo del polígono
 * (array de [lat, lng]) y lo empuja al undo-stack. Deshacer y rehacer
 * mueven el puntero entre estados. Nunca mutamos un estado existente.
 *
 * Los estados guardados son ARRAYS PLANOS de [lat, lng], no LatLng de
 * Leaflet. Facilita clonado con JSON.parse(JSON.stringify(x)) sin
 * arrastrar prototipos.
 */

/**
 * Tipos de punto de interés que ofrece el editor. Lista consensuada con
 * Nico para la primera versión. "Otro" permite etiqueta libre.
 */
export const TIPOS_PUNTO = [
  { id: 'escuela',   label: 'Escuela / Jardín',       emoji: '🏫' },
  { id: 'comedor',   label: 'Comedor comunitario',    emoji: '🍲' },
  { id: 'salud',     label: 'Centro de salud',        emoji: '⚕️' },
  { id: 'merendero', label: 'Merendero',              emoji: '🥛' },
  { id: 'club',      label: 'Club / Espacio deportivo', emoji: '⚽' },
  { id: 'iglesia',   label: 'Iglesia / Templo',       emoji: '⛪' },
  { id: 'basural',   label: 'Basural / Punto crítico', emoji: '⚠️' },
  { id: 'otro',      label: 'Otro',                    emoji: '📍' }
];

function tipoPorId(id) { return TIPOS_PUNTO.find(t => t.id === id) || TIPOS_PUNTO[TIPOS_PUNTO.length - 1]; }

// URLs del spec del proyecto (idénticas al mapa público, para consistencia)
const TILES = {
  base: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
  labels: 'https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png'
};

const CONCORDIA = { lat: -31.385, lng: -58.025, zoom: 13 };

/**
 * Crea una instancia del motor.
 * @param {HTMLElement} contenedor  Div donde montar el mapa.
 * @param {object} params
 *   - barrio: objeto barrio.json (para color)
 *   - geometria: objeto GeoJSON FeatureCollection
 *   - onCambio: () => void   avisar cuando cambia el estado (para UI)
 *   - onHerramientaCambio: (idHerramienta|null) => void
 * @returns {objeto motor} con métodos públicos para controlar el editor.
 */
export function crearMotorMapa(contenedor, { barrio, geometria, puntos, onCambio, onHerramientaCambio }) {
  // ─── Estado interno ─────────────────────────────────────────
  const state = {
    // Polígono actual: array de [lat, lng]. Se muta reemplazándolo
    // completo, nunca in-place.
    contornoActual: extraerContorno(geometria),

    // Contorno original al abrir el editor (para el botón Descartar).
    contornoOriginal: null,

    // Puntos de interés: array de {id, nombre, tipo, coord: [lat, lng]}.
    // Estructura interna del motor; se serializa a GeoJSON al guardar.
    puntosActuales: extraerPuntos(puntos),
    puntosOriginales: null,

    // Historial: stack de {contorno, puntos} + puntero al estado actual.
    // Un solo historial unificado, para que Deshacer haga lo intuitivo
    // (revierte la última acción sea de contorno o de puntos).
    historial: [],
    undoIndex: 0,

    // Herramienta activa (id string) o null si ninguna.
    herramientaActiva: null,

    // Referencias a objetos Leaflet.
    map: null,
    poligono: null,
    manijasLayer: null,
    puntosLayer: null,
  };

  // Guardamos el estado inicial en el historial como punto de partida.
  state.contornoOriginal = clonar(state.contornoActual);
  state.puntosOriginales = clonar(state.puntosActuales);
  state.historial.push(snapshot());

  // ─── Inicializar Leaflet ────────────────────────────────────
  const map = L.map(contenedor, {
    zoomControl: true,
    doubleClickZoom: false,   // el doble clic lo vamos a usar para "terminar dibujo"
    attributionControl: false
  }).setView([CONCORDIA.lat, CONCORDIA.lng], CONCORDIA.zoom);
  state.map = map;

  L.tileLayer(TILES.base, { maxZoom: 19 }).addTo(map);
  L.tileLayer(TILES.labels, { maxZoom: 19, pane: 'shadowPane' }).addTo(map);

  // Layers para el polígono y las manijas (así podemos limpiarlas fácil).
  state.manijasLayer = L.layerGroup().addTo(map);
  state.puntosLayer = L.layerGroup().addTo(map);

  redibujarPoligono();
  redibujarPuntos();
  centrarEnBarrio();

  // Router central de clics del mapa. Cada herramienta que reacciona al
  // clic sobre el mapa (no sobre una manija) se despacha desde acá.
  // Las manijas tienen sus propios handlers y usan stopPropagation para
  // que este handler no dispare cuando clicás sobre una manija.
  //
  // Detalle: Leaflet dispara 'click' antes de 'dblclick'. Cuando el
  // usuario hace doble clic para terminar un redibujado, los dos clics
  // individuales llegarían primero y agregarían puntos "fantasma". Para
  // evitarlo, en modo 'redibujar' encolamos los clics con un pequeño
  // retraso; si en ese margen llega un dblclick, se cancela.
  let clicPendiente = null;

  map.on('click', (e) => {
    if (state.herramientaActiva === 'redibujar') {
      // Aplazar 220ms para que un posible dblclick lo pueda cancelar
      clearTimeout(clicPendiente);
      clicPendiente = setTimeout(() => {
        agregarPuntoAlRedibujo(e.latlng);
        clicPendiente = null;
      }, 220);
      return;
    }
    switch (state.herramientaActiva) {
      case 'agregar-limite':
        agregarPuntoAlContorno(e.latlng);
        break;
      case 'agregar-punto':
        agregarPuntoDeInteres(e.latlng);
        break;
      // 'mover-punto', 'duplicar', 'quitar-punto' se disparan al clic
      // sobre un marcador de punto, no sobre el mapa vacío.
    }
  });

  // Doble clic para cerrar el redibujado.
  map.on('dblclick', (e) => {
    if (state.herramientaActiva === 'redibujar') {
      // Cancelar cualquier clic aplazado (los dos que componen el dblclick)
      clearTimeout(clicPendiente);
      clicPendiente = null;
      terminarRedibujo();
    }
  });

  // ─── Métodos públicos ───────────────────────────────────────
  const api = {
    /** Activa una herramienta. Pasar null para desactivar todas. */
    activarHerramienta(id) {
      // Si había un redibujado en curso, se descarta al cambiar de
      // herramienta (con confirmación implícita: el usuario ya no
      // quiere estar en modo dibujo).
      if (state.contornoBorrador && id !== 'redibujar') {
        cancelarRedibujo();
      }
      state.herramientaActiva = id;
      aplicarModoVisual();
      onHerramientaCambio && onHerramientaCambio(id);
    },

    /**
     * ¿Hay cambios sin guardar respecto al original?
     * Incluye el caso de un redibujado en curso: si el usuario colocó
     * puntos en modo "Rehacer el contorno" pero todavía no cerró el
     * polígono (doble clic), esos puntos no se reflejan aún en
     * contornoActual — pero representan trabajo real que se perdería
     * sin aviso si saliera del editor en ese momento.
     */
    hayCambios() {
      const contornoBorradorConPuntos = state.contornoBorrador && state.contornoBorrador.length > 0;
      return !igualContornos(state.contornoActual, state.contornoOriginal) ||
             !igualPuntos(state.puntosActuales, state.puntosOriginales) ||
             contornoBorradorConPuntos;
    },

    /** Cantidad de puntos del contorno actual. */
    cantidadPuntos() {
      return state.contornoActual.length;
    },

    /** Devuelve una copia de los puntos de interés actuales. */
    obtenerPuntos() {
      return clonar(state.puntosActuales);
    },

    /** Modifica el nombre de un punto de interés por id. */
    renombrarPunto(idPunto, nuevoNombre) {
      const p = state.puntosActuales.find(x => x.id === idPunto);
      if (!p) return;
      if (p.nombre === nuevoNombre) return;
      p.nombre = nuevoNombre;
      pushHistorial();
      redibujarPuntos();
    },

    /** Cambia el tipo de un punto de interés. */
    cambiarTipoPunto(idPunto, nuevoTipo) {
      const p = state.puntosActuales.find(x => x.id === idPunto);
      if (!p) return;
      if (p.tipo === nuevoTipo) return;
      p.tipo = nuevoTipo;
      pushHistorial();
      redibujarPuntos();
    },

    /**
     * Estado del redibujado en curso: cantidad de puntos ya colocados,
     * o null si no hay redibujado activo. Sirve para que la UI muestre
     * el progreso ("Ya colocaste 3 puntos, doble clic para terminar").
     */
    puntosBorrador() {
      return state.contornoBorrador ? state.contornoBorrador.length : null;
    },

    /** ¿Se puede deshacer? */
    puedeDeshacer() { return state.undoIndex > 0; },
    /** ¿Se puede rehacer? */
    puedeRehacer() { return state.undoIndex < state.historial.length - 1; },

    deshacer() {
      if (!this.puedeDeshacer()) return;
      state.undoIndex--;
      restaurarSnapshot(state.historial[state.undoIndex]);
      redibujarTodo();
      onCambio && onCambio();
    },
    rehacer() {
      if (!this.puedeRehacer()) return;
      state.undoIndex++;
      restaurarSnapshot(state.historial[state.undoIndex]);
      redibujarTodo();
      onCambio && onCambio();
    },

    /** Descarta todos los cambios y vuelve al contorno original. */
    descartarCambios() {
      state.contornoActual = clonar(state.contornoOriginal);
      state.puntosActuales = clonar(state.puntosOriginales);
      state.historial = [snapshot()];
      state.undoIndex = 0;
      // Si había un redibujado en curso (puntos ya colocados en modo
      // "Rehacer el contorno"), también se descarta. Si no, el hint
      // seguiría mostrando "Llevás N puntos" con datos obsoletos y los
      // puntos del borrador quedarían dibujados sobre el mapa aunque
      // el usuario ya pidió descartar todo.
      if (state.contornoBorrador) {
        state.contornoBorrador = null;
        dibujarBorradorRedibujo();
      }
      redibujarTodo();
      onCambio && onCambio();
    },

    /** Devuelve el GeoJSON actualizado del contorno, listo para guardar. */
    obtenerGeoJson() {
      return construirGeoJson(geometria, state.contornoActual, barrio);
    },

    /** Devuelve el GeoJSON de puntos, listo para guardar. */
    obtenerPuntosGeoJson() {
      return construirPuntosGeoJson(state.puntosActuales);
    },

    /** Marca el estado actual como "guardado": el original se actualiza. */
    marcarGuardado() {
      state.contornoOriginal = clonar(state.contornoActual);
      state.puntosOriginales = clonar(state.puntosActuales);
      state.historial = [snapshot()];
      state.undoIndex = 0;
      onCambio && onCambio();
    },

    /** Libera recursos. */
    destruir() {
      map.remove();
    }
  };

  return api;

  /* ─── Internos ───────────────────────────────────────────── */

  function redibujarPoligono() {
    if (state.poligono) {
      state.poligono.remove();
      state.poligono = null;
    }
    state.manijasLayer.clearLayers();

    if (!state.contornoActual.length) return;

    // Polígono principal (naranja del spec)
    const opacidadFondo = state.herramientaActiva === 'redibujar' ? 0.05
                        : state.herramientaActiva ? 0.10
                        : 0.25;
    const opacidadBorde = state.herramientaActiva === 'redibujar' ? 0.35 : 1.0;
    state.poligono = L.polygon(state.contornoActual, {
      color: barrio.color || '#FFA500',
      weight: 3,
      opacity: opacidadBorde,
      fillOpacity: opacidadFondo
    }).addTo(map);

    // Si hay una herramienta de edición de límites activa, mostramos manijas.
    if (esHerramientaLimites(state.herramientaActiva)) {
      dibujarManijas();
    }
  }

  function dibujarManijas() {
    state.contornoActual.forEach((coord, i) => {
      const manija = L.circleMarker(coord, {
        radius: 6,
        color: '#fff',
        weight: 2,
        fillColor: barrio.color || '#FFA500',
        fillOpacity: 1
      }).addTo(state.manijasLayer);
      manija.__indice = i;

      // Conectar interacciones según la herramienta activa.
      if (state.herramientaActiva === 'mover-limites') {
        conectarArrastreManija(manija, i);
      } else if (state.herramientaActiva === 'quitar-limite') {
        manija.on('click', () => quitarPunto(i));
        manija.setStyle({ radius: 7, fillColor: '#dc3545' });
      }
    });
  }

  /**
   * Convierte una manija circleMarker en algo arrastrable manualmente.
   * Leaflet.circleMarker no es arrastrable de fábrica, así que
   * capturamos mousedown en la manija y trackeamos mousemove/mouseup
   * sobre el mapa entero.
   *
   * Guardamos un snapshot del contorno al mousedown, no en cada
   * mousemove — así al soltar generamos un solo estado nuevo en el
   * historial (arrastrar 200px = 1 paso de undo, no 200).
   */
  function conectarArrastreManija(manija, indice) {
    let arrastrando = false;
    let snapshotAntes = null;

    manija.on('mousedown', (e) => {
      // Prevenir que Leaflet arranque el pan del mapa
      L.DomEvent.stopPropagation(e);
      L.DomEvent.preventDefault(e.originalEvent);
      arrastrando = true;
      snapshotAntes = clonar(state.contornoActual);
      // Deshabilitar el pan mientras arrastramos
      map.dragging.disable();
      manija.setStyle({ radius: 8, weight: 3 });
    });

    map.on('mousemove', (e) => {
      if (!arrastrando) return;
      // Actualizamos in-place el contorno visible (sin push al historial
      // todavía; eso pasa al soltar).
      state.contornoActual[indice] = [e.latlng.lat, e.latlng.lng];
      state.poligono.setLatLngs(state.contornoActual);
      manija.setLatLng([e.latlng.lat, e.latlng.lng]);
    });

    map.on('mouseup', () => {
      if (!arrastrando) return;
      arrastrando = false;
      map.dragging.enable();
      manija.setStyle({ radius: 6, weight: 2 });
      // ¿Cambió realmente? Si soltó sin mover, no ensuciamos el historial.
      if (!igualContornos(state.contornoActual, snapshotAntes)) {
        pushHistorial();
      }
      snapshotAntes = null;
    });
  }

  function quitarPunto(indice) {
    // No permitir dejar el polígono con menos de 3 puntos
    if (state.contornoActual.length <= 3) {
      // Aviso visual: el polígono no puede quedar con menos de 3 puntos
      alert('El contorno no puede tener menos de 3 puntos. Usá "Rehacer el contorno" si querés empezar de cero.');
      return;
    }
    state.contornoActual = state.contornoActual.filter((_, i) => i !== indice);
    pushHistorial();
    redibujarPoligono();
  }

  function pushHistorial() {
    // Cortar cualquier estado futuro (rehacer) al hacer un cambio nuevo
    state.historial = state.historial.slice(0, state.undoIndex + 1);
    state.historial.push(snapshot());
    state.undoIndex = state.historial.length - 1;
    onCambio && onCambio();
  }

  function snapshot() {
    return {
      contorno: clonar(state.contornoActual),
      puntos: clonar(state.puntosActuales)
    };
  }

  function restaurarSnapshot(s) {
    state.contornoActual = clonar(s.contorno);
    state.puntosActuales = clonar(s.puntos);
  }

  function redibujarTodo() {
    redibujarPoligono();
    redibujarPuntos();
  }

  /**
   * Inserta un vértice nuevo en el contorno.
   * Filosofía "seguridad sobre velocidad": no lo pone donde el usuario
   * clicó, sino sobre el tramo más cercano del contorno actual. Así se
   * garantiza que el polígono nunca queda con un pico raro que sale
   * lejos si el clic fue impreciso.
   */
  function agregarPuntoAlContorno(latlng) {
    const clic = [latlng.lat, latlng.lng];
    const proyeccion = proyectarSobreContorno(clic, state.contornoActual);
    // Insertar en la posición `proyeccion.indiceInsertar`
    const nuevo = clonar(state.contornoActual);
    nuevo.splice(proyeccion.indiceInsertar, 0, proyeccion.punto);
    state.contornoActual = nuevo;
    pushHistorial();
    redibujarPoligono();
  }

  /**
   * Modo "Rehacer el contorno": reemplaza el contorno actual dibujando
   * uno nuevo desde cero, punto por punto. El polígono se cierra al
   * hacer doble clic o cuando el usuario cambia de herramienta.
   *
   * Mantenemos el contorno viejo visible con opacidad muy baja mientras
   * se dibuja el nuevo, para que el usuario pueda usarlo como referencia
   * visual y no perder la orientación.
   */
  function agregarPuntoAlRedibujo(latlng) {
    if (!state.contornoBorrador) {
      state.contornoBorrador = [];
      dibujarBorradorRedibujo();
    }
    state.contornoBorrador.push([latlng.lat, latlng.lng]);
    dibujarBorradorRedibujo();
    onCambio && onCambio();
  }

  function terminarRedibujo() {
    if (!state.contornoBorrador || state.contornoBorrador.length < 3) {
      // No se puede tener un polígono con menos de 3 puntos
      state.contornoBorrador = null;
      dibujarBorradorRedibujo();
      return;
    }
    state.contornoActual = state.contornoBorrador;
    state.contornoBorrador = null;
    pushHistorial();
    redibujarPoligono();
  }

  function cancelarRedibujo() {
    state.contornoBorrador = null;
    dibujarBorradorRedibujo();
  }

  function dibujarBorradorRedibujo() {
    if (state.borradorLayer) {
      state.borradorLayer.remove();
      state.borradorLayer = null;
    }
    if (!state.contornoBorrador || !state.contornoBorrador.length) return;
    state.borradorLayer = L.layerGroup().addTo(map);
    // Línea uniendo los puntos que ya se dibujaron
    if (state.contornoBorrador.length >= 2) {
      L.polyline(state.contornoBorrador, {
        color: barrio.color || '#FFA500',
        weight: 3,
        dashArray: '6,4'
      }).addTo(state.borradorLayer);
    }
    // Marcadores en cada punto ya dibujado
    state.contornoBorrador.forEach((coord, i) => {
      const esUltimo = i === state.contornoBorrador.length - 1;
      L.circleMarker(coord, {
        radius: esUltimo ? 7 : 5,
        color: '#fff',
        weight: 2,
        fillColor: esUltimo ? '#2a9d3c' : (barrio.color || '#FFA500'),
        fillOpacity: 1
      }).addTo(state.borradorLayer);
    });
  }

  /* ═══ Puntos de interés ═══════════════════════════════════════ */

  function redibujarPuntos() {
    state.puntosLayer.clearLayers();
    state.puntosActuales.forEach(punto => {
      const tipo = tipoPorId(punto.tipo);
      const icono = L.divIcon({
        className: 'mte-punto-icon',
        html: `<div class="mte-punto-badge" title="${escapeAttr(punto.nombre)}">
                 <span class="mte-punto-emoji">${tipo.emoji}</span>
               </div>`,
        iconSize: [30, 30],
        iconAnchor: [15, 15]
      });
      const marker = L.marker(punto.coord, {
        icon: icono,
        // Draggable solo si la herramienta activa lo permite
        draggable: state.herramientaActiva === 'mover-punto'
      }).addTo(state.puntosLayer);
      marker.__punto = punto;

      // Conectar interacciones según herramienta
      if (state.herramientaActiva === 'mover-punto') {
        let snapAntes = null;
        marker.on('dragstart', () => {
          snapAntes = { ...punto.coord };
        });
        marker.on('dragend', (e) => {
          const ll = e.target.getLatLng();
          punto.coord = [ll.lat, ll.lng];
          pushHistorial();
        });
      } else if (state.herramientaActiva === 'quitar-punto') {
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          eliminarPuntoDeInteres(punto.id);
        });
      } else if (state.herramientaActiva === 'duplicar') {
        marker.on('click', (e) => {
          L.DomEvent.stopPropagation(e);
          duplicarPuntoDeInteres(punto.id);
        });
      }
    });
  }

  function agregarPuntoDeInteres(latlng) {
    const nuevo = {
      id: nuevoIdPunto(),
      nombre: '',
      tipo: 'otro',
      coord: [latlng.lat, latlng.lng]
    };
    state.puntosActuales.push(nuevo);
    pushHistorial();
    redibujarPuntos();
    // El editor va a abrir un panel para que el usuario le ponga nombre
    // y tipo; se comunica vía onCambio y la UI lo detecta.
  }

  function duplicarPuntoDeInteres(idPunto) {
    const orig = state.puntosActuales.find(p => p.id === idPunto);
    if (!orig) return;
    // Desplazamos ~15m al sudeste para que el duplicado no quede debajo
    // del original. En latitud, 15m ≈ 0.000135 grados.
    const OFFSET = 0.000135;
    const copia = {
      id: nuevoIdPunto(),
      nombre: orig.nombre ? `${orig.nombre} (copia)` : '',
      tipo: orig.tipo,
      coord: [orig.coord[0] - OFFSET, orig.coord[1] + OFFSET]
    };
    state.puntosActuales.push(copia);
    pushHistorial();
    redibujarPuntos();
  }

  function eliminarPuntoDeInteres(idPunto) {
    state.puntosActuales = state.puntosActuales.filter(p => p.id !== idPunto);
    pushHistorial();
    redibujarPuntos();
  }

  function nuevoIdPunto() {
    // 8 caracteres alfanuméricos, suficiente para que no colisionen.
    return 'p_' + Math.random().toString(36).slice(2, 10);
  }

  function aplicarModoVisual() {
    // Cambiar la opacidad del polígono según haya herramienta activa.
    redibujarPoligono();
    redibujarPuntos();
    // Cursor global sobre el mapa según herramienta.
    const cont = map.getContainer();
    cont.classList.remove('mte-cursor-crosshair', 'mte-cursor-move', 'mte-cursor-eliminar');
    if (state.herramientaActiva === 'agregar-limite' ||
        state.herramientaActiva === 'agregar-punto' ||
        state.herramientaActiva === 'redibujar') {
      cont.classList.add('mte-cursor-crosshair');
    } else if (state.herramientaActiva === 'mover-limites' ||
               state.herramientaActiva === 'mover-punto') {
      cont.classList.add('mte-cursor-move');
    } else if (state.herramientaActiva === 'quitar-limite' ||
               state.herramientaActiva === 'quitar-punto') {
      cont.classList.add('mte-cursor-eliminar');
    }
  }

  function centrarEnBarrio() {
    if (state.contornoActual.length >= 3) {
      map.fitBounds(L.latLngBounds(state.contornoActual), { padding: [40, 40] });
    }
  }
}

/* ═══════════════════════════════════════════════════════════════════
   Funciones puras (sin dependencia de Leaflet ni estado)
   ═══════════════════════════════════════════════════════════════════ */

function extraerContorno(geometria) {
  // Aceptamos FeatureCollection con una feature Polygon, o Feature Polygon.
  const f = geometria?.type === 'FeatureCollection'
    ? geometria.features?.[0]
    : geometria;
  const geom = f?.geometry;
  if (!geom || geom.type !== 'Polygon') return [];
  // GeoJSON usa [lng, lat]; Leaflet usa [lat, lng]. Invertimos.
  const anillo = geom.coordinates?.[0] || [];
  return anillo.map(([lng, lat]) => [lat, lng]);
}

function construirGeoJson(original, contorno, barrio) {
  // Reconstruimos el GeoJSON preservando la estructura del original.
  const anillo = contorno.map(([lat, lng]) => [lng, lat]);
  // Cerrar el anillo si no está cerrado
  if (anillo.length && (anillo[0][0] !== anillo[anillo.length - 1][0]
                     || anillo[0][1] !== anillo[anillo.length - 1][1])) {
    anillo.push([anillo[0][0], anillo[0][1]]);
  }
  const nuevaFeature = {
    type: 'Feature',
    properties: { id: barrio.id, nombre: barrio.nombreVisible },
    geometry: { type: 'Polygon', coordinates: [anillo] }
  };
  if (original?.type === 'FeatureCollection') {
    return { ...original, features: [nuevaFeature] };
  }
  return nuevaFeature;
}

function clonar(x) { return JSON.parse(JSON.stringify(x)); }

function igualContornos(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (Math.abs(a[i][0] - b[i][0]) > 1e-9) return false;
    if (Math.abs(a[i][1] - b[i][1]) > 1e-9) return false;
  }
  return true;
}

function esHerramientaLimites(id) {
  return id === 'mover-limites' || id === 'agregar-limite' ||
         id === 'quitar-limite' || id === 'redibujar';
}

function extraerPuntos(puntosGeojson) {
  if (!puntosGeojson || !Array.isArray(puntosGeojson.features)) return [];
  return puntosGeojson.features.map((f, i) => {
    const geom = f.geometry || {};
    const props = f.properties || {};
    const [lng, lat] = (geom.coordinates || [0, 0]);
    return {
      id: props.id || `p_${i}_${Date.now().toString(36)}`,
      nombre: props.nombre || '',
      tipo: props.tipo || 'otro',
      coord: [lat, lng]
    };
  });
}

function construirPuntosGeoJson(puntos) {
  return {
    type: 'FeatureCollection',
    features: puntos.map(p => ({
      type: 'Feature',
      properties: { id: p.id, nombre: p.nombre, tipo: p.tipo },
      geometry: { type: 'Point', coordinates: [p.coord[1], p.coord[0]] }
    }))
  };
}

function igualPuntos(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) {
    if (a[i].id !== b[i].id) return false;
    if (a[i].nombre !== b[i].nombre) return false;
    if (a[i].tipo !== b[i].tipo) return false;
    if (Math.abs(a[i].coord[0] - b[i].coord[0]) > 1e-9) return false;
    if (Math.abs(a[i].coord[1] - b[i].coord[1]) > 1e-9) return false;
  }
  return true;
}

function escapeAttr(s) {
  return String(s || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

/**
 * Proyecta un punto sobre el segmento más cercano de un contorno cerrado.
 * Devuelve el punto proyectado y en qué posición del array insertarlo.
 *
 * Geometría plana simple (interpretamos lat/lng como coordenadas
 * cartesianas). Para la escala de Concordia (barrios de decenas o
 * cientos de metros), el error de no proyectar en esfera es imperceptible.
 */
function proyectarSobreContorno(punto, contorno) {
  let mejor = { dist: Infinity, punto: null, indiceInsertar: 1 };
  for (let i = 0; i < contorno.length; i++) {
    const a = contorno[i];
    const b = contorno[(i + 1) % contorno.length];
    const proy = proyectarSobreSegmento(punto, a, b);
    if (proy.dist < mejor.dist) {
      mejor = { dist: proy.dist, punto: proy.punto, indiceInsertar: i + 1 };
    }
  }
  return mejor;
}

function proyectarSobreSegmento(p, a, b) {
  const abx = b[0] - a[0], aby = b[1] - a[1];
  const apx = p[0] - a[0], apy = p[1] - a[1];
  const largoAB2 = abx * abx + aby * aby;
  let t = largoAB2 === 0 ? 0 : (apx * abx + apy * aby) / largoAB2;
  t = Math.max(0, Math.min(1, t));
  const px = a[0] + t * abx;
  const py = a[1] + t * aby;
  const dx = p[0] - px, dy = p[1] - py;
  return { punto: [px, py], dist: Math.sqrt(dx * dx + dy * dy) };
}
